/**
 * Factory registry
 *
 * Central place for factory locations, devices, and map zone labels.
 */

export const FACTORY_LOCATIONS = [
  {
    id: "factory-colombo",
    name: "Colombo Factory",
    devices: [
      {
        id: "deviceTestUC",
        name: "Device Test UC",
        zone: "Cleanroom A",
        factoryId: "factory-colombo",
      },
      { id: "device9988", name: "Device 9988", zone: "Cleanroom B", factoryId: "factory-colombo" },
      {
        id: "device0011233",
        name: "Device 0011233",
        zone: "Loading Bay",
        factoryId: "factory-colombo",
      },
    ],
    mapZones: [
      {
        id: "cleanroom-a",
        name: "Cleanroom A",
        left: "5%",
        top: "5%",
        width: "35%",
        height: "40%",
        type: "cleanroom",
      },
      {
        id: "cleanroom-b",
        name: "Cleanroom B",
        left: "45%",
        top: "5%",
        width: "30%",
        height: "40%",
        type: "cleanroom",
      },
      {
        id: "loading",
        name: "Loading Bay",
        left: "5%",
        top: "55%",
        width: "25%",
        height: "35%",
        type: "loading",
      },
      {
        id: "storage",
        name: "Storage",
        left: "35%",
        top: "55%",
        width: "25%",
        height: "35%",
        type: "storage",
      },
      {
        id: "maintenance",
        name: "Maintenance",
        left: "65%",
        top: "55%",
        width: "25%",
        height: "25%",
        type: "storage",
      },
      {
        id: "parking",
        name: "Reset Position (Ready)",
        left: "65%",
        top: "82%",
        width: "25%",
        height: "10%",
        type: "reset",
      },
    ],
  },
  {
    id: "factory-kandy",
    name: "Kandy Factory",
    devices: [
      {
        id: "devicetestuc",
        name: "Device Test UC 2",
        zone: "Assembly Hall",
        factoryId: "factory-kandy",
      },
      { id: "deviceA72Q", name: "Device A72Q", zone: "QC Lab", factoryId: "factory-kandy" },
      { id: "deviceZX91", name: "Device ZX91", zone: "Docking Bay", factoryId: "factory-kandy" },
    ],
    mapZones: [
      {
        id: "assembly",
        name: "Assembly Hall",
        left: "5%",
        top: "5%",
        width: "35%",
        height: "40%",
        type: "cleanroom",
      },
      {
        id: "packaging",
        name: "Packaging Zone",
        left: "45%",
        top: "5%",
        width: "30%",
        height: "40%",
        type: "cleanroom",
      },
      {
        id: "receiving",
        name: "Receiving Dock",
        left: "5%",
        top: "55%",
        width: "25%",
        height: "35%",
        type: "loading",
      },
      {
        id: "qc-lab",
        name: "QC Lab",
        left: "35%",
        top: "55%",
        width: "25%",
        height: "35%",
        type: "storage",
      },
      {
        id: "spares",
        name: "Spares Vault",
        left: "65%",
        top: "55%",
        width: "25%",
        height: "25%",
        type: "storage",
      },
      {
        id: "staging",
        name: "Staging Area",
        left: "65%",
        top: "82%",
        width: "25%",
        height: "10%",
        type: "reset",
      },
    ],
  },
];

export const ALL_DEVICES = FACTORY_LOCATIONS.flatMap((factory) => factory.devices);

export function getFactoryById(factoryId) {
  return FACTORY_LOCATIONS.find((factory) => factory.id === factoryId) || null;
}

export function getFactoryForDevice(deviceId) {
  return (
    FACTORY_LOCATIONS.find((factory) => factory.devices.some((device) => device.id === deviceId)) ||
    null
  );
}

export function getFactoryMapZones(factoryId) {
  const factory = getFactoryById(factoryId);
  if (factory?.mapZones?.length) {
    return factory.mapZones;
  }
  return FACTORY_LOCATIONS[0].mapZones;
}
