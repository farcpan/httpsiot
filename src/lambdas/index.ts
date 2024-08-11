import {
	IoTClient,
	CreateKeysAndCertificateCommand,
	CreatePolicyCommand,
	CreateThingCommand,
	CreateKeysAndCertificateCommandOutput,
	AttachPolicyCommand,
	AttachThingPrincipalCommand,
} from '@aws-sdk/client-iot';

export const createCertificateHandler = async (event: any, context: any) => {
	// 環境変数
	const region = process.env['region'];
	const accountId = process.env['accountId'];
	const stage = process.env['stage'];
	const policyName = process.env['policyName'];

	// リクエスト
	const body = event.body;
	const { id } = JSON.parse(body) as { id: string };

	const thingName = stage === 'prd' ? `thing-${id}` : `thing-${id}-${stage}`;

	const client = new IoTClient();
	// Thing作成
	try {
		await client.send(
			new CreateThingCommand({
				thingName: thingName,
			})
		);
	} catch (e) {
		return getResponse({
			statusCode: 500,
			body: JSON.stringify(e),
		});
	}

	// 証明書作成
	let result: CreateKeysAndCertificateCommandOutput | null = null;
	try {
		result = await client.send(
			new CreateKeysAndCertificateCommand({
				setAsActive: true,
			})
		);
	} catch (e) {
		return getResponse({
			statusCode: 500,
			body: JSON.stringify(e),
		});
	}

	if (
		!result ||
		!result.certificateArn ||
		!result.certificateId ||
		!result.certificatePem ||
		!result.keyPair ||
		!result.keyPair.PrivateKey
	) {
		return getResponse({
			statusCode: 500,
			body: JSON.stringify({ message: 'Failed to create keys/certificates' }),
		});
	}

	const certificateArn = result.certificateArn;
	const certificateId = result.certificateId;
	const certificatePem = result.certificatePem;
	const keyPair = result.keyPair;

	// 証明書にポリシーをアタッチ
	try {
		await client.send(
			new AttachPolicyCommand({
				policyName: policyName,
				target: certificateArn,
			})
		);
	} catch (e) {
		return getResponse({
			statusCode: 500,
			body: JSON.stringify(e),
		});
	}

	// Thingに証明書をアタッチ
	try {
		await client.send(
			new AttachThingPrincipalCommand({
				thingName: thingName,
				principal: certificateArn,
			})
		);
	} catch (e) {
		return getResponse({
			statusCode: 500,
			body: JSON.stringify(e),
		});
	}

	return getResponse({
		statusCode: 200,
		body: JSON.stringify({
			certificateArn: certificateArn,
			certificateId: certificateId,
			certificatePem: certificatePem,
			keypair: keyPair,
		}),
	});
};

export const helloHandler = async (event: any, context: any) => {
	return getResponse({ statusCode: 200, body: JSON.stringify(event) });
};

/////////////////////////////////////////////////////////////////////////////
// 内部処理
/////////////////////////////////////////////////////////////////////////////
const getResponse = ({ statusCode, body }: { statusCode: number; body: string }) => {
	return {
		statusCode: statusCode,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Content-Type': 'application/json; charset=utf-8',
		},
		body: body,
	};
};
