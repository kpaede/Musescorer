/** Validate the release identity before building or packaging installer assets. */
export function validateReleaseIdentity(manifest) {
 const id = manifest?.id;
 if (typeof id !== 'string' || !/^[a-z]+(?:-[a-z]+)*$/u.test(id) || id.includes('obsidian') || id.endsWith('plugin')) {
  throw new Error('Plugin ID must use lowercase letters and hyphens, must not contain obsidian and must not end with plugin.');
 }
 if (typeof manifest.version !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(manifest.version)) {
  throw new Error('Plugin version must use the x.y.z format without a prefix or suffix.');
 }
 return manifest;
}
