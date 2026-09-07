import {
  deviceCapabilitiesSchema,
  photoPermissionSchema,
  type DeviceCapabilities,
  type EngineResult,
  type PhotoPermission,
} from '@seleva/core';

export interface LibraryAccessTransport {
  getCapabilities(): Promise<unknown>;
  getPermission(): Promise<unknown>;
  requestPermission(): Promise<unknown>;
}
export function createLibraryAccess(native: LibraryAccessTransport | null) {
  async function call<T>(
    operation: (module: LibraryAccessTransport) => Promise<unknown>,
    parse: (value: unknown) => T,
  ): Promise<EngineResult<T>> {
    if (!native) return { ok: false, error: 'DEVICE_UNSUPPORTED' };
    try {
      return { ok: true, value: parse(await operation(native)) };
    } catch {
      return { ok: false, error: 'UNKNOWN' };
    }
  }
  return {
    getCapabilities: (): Promise<EngineResult<DeviceCapabilities>> =>
      call(
        (module) => module.getCapabilities(),
        (value) => deviceCapabilitiesSchema.parse(value),
      ),
    getPermission: (): Promise<EngineResult<PhotoPermission>> =>
      call(
        (module) => module.getPermission(),
        (value) => photoPermissionSchema.parse(value),
      ),
    requestPermission: (): Promise<EngineResult<PhotoPermission>> =>
      call(
        (module) => module.requestPermission(),
        (value) => photoPermissionSchema.parse(value),
      ),
  };
}
