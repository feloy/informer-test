import { CoreV1Api, KubeConfig, V1Service, V1ServiceList, makeInformer } from '@kubernetes/client-node';
import type { IncomingMessage } from 'node:http';

async function createService(k8sApi: CoreV1Api, ns: string, name: string) {
  await k8sApi.createNamespacedService(ns, {
    metadata: {
      name: name,
    },
    spec: {
      clusterIP: 'None',
      type: 'ClusterIP',
    },
  } as V1Service);
}

async function deleteService(k8sApi: CoreV1Api, ns: string, name: string) {
  await k8sApi.deleteNamespacedService(name, ns);
}

function createServiceInformer(kc: KubeConfig, k8sApi: CoreV1Api, ns: string) {
  const path = `/api/v1/namespaces/${ns}/services`;
  const listPromiseFn = (): Promise<{
    response: IncomingMessage;
    body: V1ServiceList;
  }> => k8sApi.listNamespacedService(ns);
  const informer = makeInformer(kc, path, listPromiseFn);

  informer.on('add', (obj: V1Service) => {
    console.log('add', obj.metadata?.name);
  });

  informer.on('update', (obj: V1Service) => {
    console.log('update', obj.metadata?.name);
  });

  informer.on('delete', (obj: V1Service) => {
    console.log('delete', obj.metadata?.name);
  });
  informer.on('error', (err: unknown) => {
    console.log('error', err);
  });
  informer.on('connect', (err: unknown) => {
    console.log('connect', err);
  });
  return informer;

}

async function wait(s: number) {
  console.log(`wait ${s}s`);
  await new Promise(resolve => setTimeout(resolve, 1000 * s));
}

(async function() {
  const kc = new KubeConfig();
  kc.loadFromDefault();

  const k8sApi = kc.makeApiClient(CoreV1Api);

  await createService(k8sApi, 'ns1', 'svc1');

  let informer = createServiceInformer(kc, k8sApi, 'ns1');
  await informer.start().catch(err => console.log('start', err));
  // 'add' events should be received for services in the namespace
  console.log('stop informer');
  await informer.stop();

  await informer.start().catch(err => console.log('start', err));
  // no 'add' event should be received, as they have been sent previously
  await wait(1);
  await informer.stop();

  await createService(k8sApi, 'ns1', 'svc2');
  await informer.start().catch(err => console.log('start', err));
  // 'add' event should be received for svc2
  await wait(1);
  await informer.stop();

  informer = createServiceInformer(kc, k8sApi, 'ns1');
  await informer.start().catch(err => console.log('start', err));
  // 'add' event should be received for svc1 and svc2
  await wait(1);
  await informer.stop();

  await deleteService(k8sApi, 'ns1', 'svc1');
  await deleteService(k8sApi, 'ns1', 'svc2');
}());
