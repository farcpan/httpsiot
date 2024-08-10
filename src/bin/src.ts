import { App, Stack } from 'aws-cdk-lib';
import { ContextParameters } from '../utils/context';
import { MainStack } from '../lib/main-stack';

const app = new App();
const context = new ContextParameters(app);

new MainStack(app, context.getResourceId('main-stack'), {
	context: context,
});
