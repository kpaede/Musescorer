import { Component, setIcon } from 'obsidian';

export function iconButton(owner: Component, parent: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
 const button = parent.createEl('button', { cls: 'musescorer-icon-button clickable-icon', attr: { type: 'button', 'aria-label': label, title: label } });
 setIcon(button, icon);
 owner.registerDomEvent(button, 'click', event => { event.preventDefault(); event.stopPropagation(); action(); });
 return button;
}
