import type { InventoryItem, ItemKind } from '@custom-tabletop/shared';

const KIND_LABELS: Record<ItemKind, string> = {
  camera: 'Camera',
  flashlight: 'Flashlight',
  walkie: 'Walkie-talkie',
  calculator: 'Calculator',
};

/**
 * A small corner HUD showing what the local player is currently carrying
 * from the chest (the gadgets inventory, phase 1) — informational only for
 * now; each gadget's own key/effect lands with that gadget, put things back
 * via the chest dialog.
 */
export function HeldItems({ items }: { items: InventoryItem[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div className="held-items">
      {items.map((item) => (
        <span key={item.id} className="held-item-badge">
          {KIND_LABELS[item.kind]}
        </span>
      ))}
    </div>
  );
}
