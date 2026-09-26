import type { Drink, InventoryItem, ItemKind } from '@custom-tabletop/shared';
import { CalculatorIcon, CameraIcon, FlashlightIcon, MugIcon, WalkieIcon } from './icons.js';

const DRINK_LABELS: Record<Drink, string> = { tea: 'Tea', cocoa: 'Hot cocoa' };

const KIND_LABELS: Record<ItemKind, string> = {
  camera: 'Camera',
  flashlight: 'Flashlight',
  walkie: 'Walkie-talkie',
  calculator: 'Calculator',
};

const KIND_ICONS: Record<ItemKind, typeof CameraIcon> = {
  camera: CameraIcon,
  flashlight: FlashlightIcon,
  walkie: WalkieIcon,
  calculator: CalculatorIcon,
};

/**
 * The single item slot (gadgets phase 6) — always visible, bottom-right
 * corner: an empty outline when the local player holds nothing, or a 2D
 * icon for whichever one gadget they're currently carrying from the chest.
 * Only one item can ever be held at a time (enforced server-side by
 * `SessionStore.takeItem`), so this never needs to show more than one.
 */
export function HeldItems({ items, drink }: { items: InventoryItem[]; drink: Drink | null }) {
  const kind = items[0]?.kind ?? null;
  // A drink takes the same single slot as a gadget (refreshments.ts).
  const Icon = drink ? MugIcon : kind ? KIND_ICONS[kind] : null;
  const label = drink ? DRINK_LABELS[drink] : kind ? KIND_LABELS[kind] : null;
  return (
    <div className="held-item-slot" aria-label={label ? `Holding: ${label}` : 'Empty'}>
      {Icon ? (
        <Icon className="held-item-icon" />
      ) : (
        <span className="held-item-slot-empty" aria-hidden="true" />
      )}
    </div>
  );
}
