export const createCertificateHandler = async (event: any, context: any) => {
	return {
		statusCode: 200,
		headers: {
			'Access-Control-Allow-Origin': '*',
			'Content-Type': 'application/json; charset=utf-8',
		},
		body: JSON.stringify(event),
	};
};
