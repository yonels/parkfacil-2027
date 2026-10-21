export class ParkFacilDevice {
  async getDeviceInfo() {
    throw new Error("getDeviceInfo() no está implementado por este adaptador.");
  }

  async getCapabilities() {
    throw new Error("getCapabilities() no está implementado por este adaptador.");
  }

  async print() {
    throw new Error("print() no está implementado por este adaptador.");
  }

  async scanQr() {
    throw new Error("scanQr() no está implementado por este adaptador.");
  }

  async getNetworkStatus() {
    throw new Error("getNetworkStatus() no está implementado por este adaptador.");
  }
}
