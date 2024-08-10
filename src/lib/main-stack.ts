import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ContextParameters } from '../utils/context';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { join } from 'path';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { EndpointType, RestApi, Cors, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';

interface MainStackProps extends StackProps {
	context: ContextParameters;
}

export class MainStack extends Stack {
	constructor(scope: Construct, id: string, props: MainStackProps) {
		super(scope, id, props);

		const accountId = Stack.of(this).account;
		console.log(`AccoutnId: ${accountId}`);

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
			deployOptions: { stageName: stageName },
			defaultCorsPreflightOptions: {
				allowOrigins: Cors.ALL_ORIGINS,
				allowMethods: ['GET', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
				statusCode: 200,
				allowHeaders: Cors.DEFAULT_HEADERS,
			},
		});

		const createCertificateLambdaIntegration = new LambdaIntegration(createCertificateFunction);

		const initResource = restApi.root.addResource('init');

		initResource.addMethod('POST', createCertificateLambdaIntegration, {});

		/////////////////////////////////////////////////////////////////////////////
		// API URL
		/////////////////////////////////////////////////////////////////////////////
		const region = props.context.stageParameters.region;
		const registerApiUrlId: string = props.context.getResourceId('api-base-url');
		new CfnOutput(this, registerApiUrlId, {
			value: `https://${restApi.restApiId}.execute-api.${region}.amazonaws.com/${stageName}/`,
		});
	}
}
