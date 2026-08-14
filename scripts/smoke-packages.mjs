const packages = ['@harnessctl/generic-tools', '@harnessctl/opencode-tools', '@harnessctl/pi-tools'];

for (const packageName of packages) {
  const module = await import(packageName);
  if (Object.keys(module).length === 0) {
    throw new Error(`${packageName}: package entrypoint exports nothing`);
  }
  console.log(`${packageName}: entrypoint loaded`);
}
