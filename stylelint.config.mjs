/** Match reviewers that check standard CSS without honoring suppression comments. */
export default {
 ignoreDisables: true,
 rules: {
  'at-rule-no-unknown': true,
  'declaration-no-important': true,
 },
 reportDescriptionlessDisables: true,
 reportInvalidScopeDisables: true,
 reportNeedlessDisables: true,
};
