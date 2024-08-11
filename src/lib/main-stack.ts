import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ContextParameters } from '../utils/context';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
	EndpointType,
	RestApi,
	Cors,
	LambdaIntegration,
	AuthorizationType,
	MethodLoggingLevel,
} from 'aws-cdk-lib/aws-apigateway';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { CfnPolicy, CfnRoleAlias } from 'aws-cdk-lib/aws-iot';

interface MainStackProps extends StackProps {
	context: ContextParameters;
}

export class MainStack extends Stack {
	constructor(scope: Construct, id: string, props: MainStackProps) {
		super(scope, id, props);

		const accountId = Stack.of(this).account;
		const region = props.context.stageParameters.region;

		/////////////////////////////////////////////////////////////////////////////
		// IAM Role for IoT Thing to get STS token
		/////////////////////////////////////////////////////////////////////////////
		const iotCoreCredentialProviderRoleId = props.context.getResourceId(
			'iot-core-credential-provider-role'
		);
		const ioTCoreCredentialProviderRole = new Role(this, iotCoreCredentialProviderRoleId, {
			roleName: iotCoreCredentialProviderRoleId,
			assumedBy: new ServicePrincipal('credentials.iot.amazonaws.com'),
		});

		const roleAliasId = props.context.getResourceId('iot-core-credential-provider-role-alias');
		const roleAlias = new CfnRoleAlias(this, roleAliasId, {
			roleArn: ioTCoreCredentialProviderRole.roleArn,
			credentialDurationSeconds: 3600,
			roleAlias: roleAliasId,
		});

		/////////////////////////////////////////////////////////////////////////////
		// IoT Policy attached to Thing
		/////////////////////////////////////////////////////////////////////////////
		const iotPolicyId = props.context.getResourceId('iot-policy');
		const iotPolicy = new CfnPolicy(this, iotPolicyId, {
			policyName: iotPolicyId,
			policyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Action: ['iot:AssumeRoleWithCertificate'],
						Resource: [roleAlias.attrRoleAliasArn], // Role AliasのARNを指定する
					},
				],
			},
		});

		/////////////////////////////////////////////////////////////////////////////
		// DynamoDB
		/////////////////////////////////////////////////////////////////////////////
		/*
        const deviceManageTableId = props.context.getResourceId("device-manage-table");
        const deviceManageTable = new Table(this, deviceManageTableId, {
            tableName: deviceManageTableId,

        })
        */

		/////////////////////////////////////////////////////////////////////////////
		// Lambda
		/////////////////////////////////////////////////////////////////////////////
		const nodejsLambdaFunctionPath = join(__dirname, '../lambdas/index.ts');

		const createCertificateFunctionId = props.context.getResourceId('create-certificate-func');
		const createCertificateFunction = new NodejsFunction(this, createCertificateFunctionId, {
			functionName: createCertificateFunctionId,
			entry: nodejsLambdaFunctionPath,
			handler: 'createCertificateHandler',
			environment: {
				region: region,
				accountId: accountId,
				stage: props.context.stage,
				policyName: iotPolicy.policyName ?? iotPolicyId,
			},
			runtime: Runtime.NODEJS_LATEST,
			timeout: Duration.seconds(30),
			logRetention: RetentionDays.ONE_DAY,
		});
		createCertificateFunction.addToRolePolicy(
			new PolicyStatement({
				effect: Effect.ALLOW,
				actions: [
					'iot:CreateThing',
					'iot:CreatePolicy',
					'iot:CreateKeysAndCertificate',
					'iot:AttachPolicy',
					'iot:AttachThingPrincipal',
				],
				resources: ['*'],
			})
		);

		const helloFunctionId = props.context.getResourceId('hello-func');
		const helloFunction = new NodejsFunction(this, helloFunctionId, {
			functionName: helloFunctionId,
			entry: nodejsLambdaFunctionPath,
			handler: 'helloHandler',
			environment: {},
			runtime: Runtime.NODEJS_LATEST,
			timeout: Duration.seconds(30),
			logRetention: RetentionDays.ONE_DAY,
		});

		/////////////////////////////////////////////////////////////////////////////
		// APIGateway
		/////////////////////////////////////////////////////////////////////////////
		const restApiId = props.context.getResourceId('rest-api');
		const stageName: string = 'v1';
		const restApi = new RestApi(this, restApiId, {
			restApiName: restApiId,
			endpointTypes: [EndpointType.REGIONAL],
			deployOptions: {
				stageName: stageName,
			},
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowMethods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
				statusCode: 200,
				allowHeaders: Cors.DEFAULT_HEADERS,
			},
		});

		const createCertificateLambdaIntegration = new LambdaIntegration(createCertificateFunction);
		const helloLambdaIntegration = new LambdaIntegration(helloFunction);

		const initResource = restApi.root.addResource('init');
		const helloResource = restApi.root.addResource('hello');
		const iotThingResource = restApi.root.addResource('{thingName}');
		const testResource = iotThingResource.addResource('test'); // /{thingName}/test

		initResource.addMethod('POST', createCertificateLambdaIntegration, {});
		helloResource.addMethod('GET', helloLambdaIntegration, {
			authorizationType: AuthorizationType.IAM, // IAM認証を必須化
		});
		testResource.addMethod('GET', helloLambdaIntegration, {
			authorizationType: AuthorizationType.IAM, // IAM認証を必須化
		});

		/////////////////////////////////////////////////////////////////////////////
		// Attach Policy to Role assumed by IoT Device
		/////////////////////////////////////////////////////////////////////////////
		ioTCoreCredentialProviderRole.addToPolicy(
			new PolicyStatement({
				effect: Effect.ALLOW,
				actions: ['execute-api:Invoke'], // APIGateway実行権限（IAM認証されたAPI用）
				resources: [
					`arn:aws:execute-api:${region}:${accountId}:${restApi.restApiId}/${restApi.deploymentStage.stageName}/*/hello`,
					`arn:aws:execute-api:${region}:${accountId}:${restApi.restApiId}/${restApi.deploymentStage.stageName}/*/\${credentials-iot:ThingName}/test`,
				],
			})
		);

		/////////////////////////////////////////////////////////////////////////////
		// API URL
		/////////////////////////////////////////////////////////////////////////////
		const registerApiUrlId: string = props.context.getResourceId('api-base-url');
		new CfnOutput(this, registerApiUrlId, {
			value: `https://${restApi.restApiId}.execute-api.${region}.amazonaws.com/${stageName}/`,
		});
	}
}
