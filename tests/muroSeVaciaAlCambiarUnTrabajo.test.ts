import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { Job } from '../server/models/sql/Job.model.js';
import { cacheService } from '../server/services/cacheService.js';

// El muro se guarda 60 s en caché. Si un camino que cambia el estado de un trabajo (pago, webhook, aprobación) no la vaciaba,
// la persona publicaba y su trabajo «no salía» hasta un minuto después.
describe('el muro en caché se vacía cuando cambia un trabajo', () => {
  const llenar = () => {
    cacheService.set('jobs:lista:1', { jobs: [] }, 60);
    cacheService.set('users:1', { ok: true }, 60);
  };

  it('al guardar un trabajo (AfterSave) se vacían las claves jobs:* y no las ajenas', () => {
    llenar();
    Job.vaciarMuroEnCache();
    expect(cacheService.get('jobs:lista:1')).toBeNull();
    expect(cacheService.get('users:1')).not.toBeNull();
  });

  it('en las actualizaciones en masa (Job.update) también', () => {
    llenar();
    Job.vaciarMuroEnCacheEnMasa();
    expect(cacheService.get('jobs:lista:1')).toBeNull();
  });

  it('los hooks están registrados en el modelo (no solo definidos)', () => {
    const registrados = (Reflect.getMetadata('sequelize:hooks', Job) ?? []) as Array<{ hookType: string; methodName: string }>;
    const de = (tipo: string) => registrados.filter((h) => h.hookType === tipo).map((h) => h.methodName);
    expect(de('afterSave')).toContain('vaciarMuroEnCache');
    expect(de('afterDestroy')).toContain('vaciarMuroEnCache');
    expect(de('afterBulkUpdate')).toContain('vaciarMuroEnCacheEnMasa');
    expect(de('afterBulkDestroy')).toContain('vaciarMuroEnCacheEnMasa');
  });
});
