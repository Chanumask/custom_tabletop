import type { InventoryItem, ItemKind } from '@custom-tabletop/shared';
import { formatKeyCode } from './keyLabel.js';

const KIND_LABELS: Record<ItemKind, string> = {
  camera: 'Camera',
  flashlight: 'Flashlight',
  walkie: 'Walkie-talkie',
  calculator: 'Calculator',
};

/**
 * A small corner HUD showing what the local player is currently carrying
 * from the chest (the gadgets inventory) — put things back via the chest
 * dialog. Shows a key hint for whichever gadgets have a "use" action
 * implemented so far; a kind with none yet (still to come) shows just its
 * name.
 */
export function HeldItems({ items, interactKey }: { items: InventoryItem[]; interactKey: string }) {
  if (items.length === 0) {
    return null;
  }
  const hintFor = (kind: ItemKind): string | null => {
    if (kind === 'camera') {
      return formatKeyCode(interactKey);
    }
    if (kind === 'flashlight') {
      return 'F';
    }
    if (kind === 'walkie') {
      return 'R';
    }
    return null;
  };
  return (
    <div className="held-items">
      {items.map((item) => {
        const hint = hintFor(item.kind);
        return (
          <span key={item.id} className="held-item-badge">
            {KIND_LABELS[item.kind]}
            {hint && <kbd>{hint}</kbd>}
          </span>
        );
      })}
    </div>
  );
}
