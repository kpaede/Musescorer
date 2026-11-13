/** Register the pinned OTS design configuration before Tailwind compiles the standard CSS source. */
export function injectEditorTheme(css, postcss, configuration) {
 const stylesheet = postcss.parse(css);
 const anchors = stylesheet.nodes.filter(node => node.type === 'comment' && node.text.startsWith('musescorer:editor-theme —'));
 if (anchors.length !== 1) throw new Error('Review the editor theme registration point against the updated OTS stylesheet.');
 const theme = postcss.atRule({ name: 'theme', params: 'inline' });
 for (const [prop, value] of Object.entries(configuration.theme)) theme.append(postcss.decl({ prop, value }));
 const utilities = Object.entries(configuration.utilities).map(([name, declarations]) => {
  const utility = postcss.atRule({ name: 'utility', params: name });
  for (const [prop, value] of Object.entries(declarations)) utility.append(postcss.decl({ prop, value }));
  return utility;
 });
 anchors[0].replaceWith(theme, ...utilities);
 return stylesheet.toString();
}
