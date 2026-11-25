// packages/ui/index.ts
export {
  type DockAppController,
  DockShell,
  type UseDockAppOptions,
  useDockApp,
} from './dock-shell/dock-shell.ts';
export { Icons, svgIcon } from './icons/index.ts';
export { type DockPosition, Popover } from './popover/popover.ts';
export { closeTopLayerPopover, showTopLayerPopover } from './popover/top-layer.ts';
export { SettingRow } from './setting-row/setting-row.ts';
export { Switch } from './switch/switch.ts';
