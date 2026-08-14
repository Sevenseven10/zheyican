import { registerPwaServiceWorker, requestPersistentStorage } from './platform/pwaRuntime.web';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function runPwaRuntimeTests() {
  assert(await requestPersistentStorage(undefined) === 'unsupported', 'Unsupported Persistent Storage API did not degrade safely');
  assert(await requestPersistentStorage({ persisted: async () => true, persist: async () => false }) === 'already-persistent', 'Already persistent storage was requested again');
  assert(await requestPersistentStorage({ persisted: async () => false, persist: async () => true }) === 'granted', 'Persistent Storage grant was not detected');
  assert(await requestPersistentStorage({ persisted: async () => false, persist: async () => false }) === 'denied', 'Persistent Storage denial did not degrade safely');

  const registrations: Array<{ scriptURL: string; options?: RegistrationOptions }> = [];
  const registered = await registerPwaServiceWorker({
    register: async (scriptURL, options) => { registrations.push({ scriptURL, options }); },
  }, true);
  assert(registered === 'registered', 'Production Service Worker was not registered');
  const registration = registrations[0];
  assert(registration, 'Service Worker registration call was not recorded');
  assert(registration?.scriptURL === '/sw.js', 'Service Worker path changed');
  assert(registration?.options?.scope === '/', 'Service Worker scope changed');
  assert(registration?.options?.updateViaCache === 'none', 'Service Worker update bypass is missing');
  assert(await registerPwaServiceWorker(undefined, true) === 'unsupported', 'Unsupported Service Worker did not degrade safely');
  assert(await registerPwaServiceWorker({ register: async () => undefined }, false) === 'development', 'Development unexpectedly registered a Service Worker');
}

runPwaRuntimeTests().catch((error) => { throw error; });
