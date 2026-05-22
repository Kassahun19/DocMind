// @ts-ignore
import serverBundle from '../dist/server.cjs';

const app = (serverBundle as any).default || serverBundle;

export default app;
