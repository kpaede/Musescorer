/** Check shipped styles and the pinned editor sources, including their scoped Tailwind directives. */
export default {
 rules: {
  'at-rule-no-unknown': true,
  'declaration-no-important': true,
 },
 reportDescriptionlessDisables: true,
 reportInvalidScopeDisables: true,
 reportNeedlessDisables: true,
};
