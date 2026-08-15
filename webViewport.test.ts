import { startViewportSync } from './platform/viewport.web';

const stop = startViewportSync();
if (typeof stop !== 'function') throw new Error('Viewport compatibility export must provide cleanup');
stop();
