import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItem, ItemKind, Player } from '@custom-tabletop/shared';

const KIND_LABELS: Record<ItemKind, string> = {
  camera: 'Polaroid camera',
  flashlight: 'Flashlight',
  walkie: 'Walkie-talkie',
  calculator: 'Calculator',
};

/** "walkie-1" -> "Walkie-talkie #1" — only the kinds with more than one
 * physical item (the two walkies) need a number to tell them apart. */
function labelFor(item: InventoryItem): string {
  const number = item.id.split('-').pop();
  return item.kind === 'walkie' ? `${KIND_LABELS[item.kind]} #${number}` : KIND_LABELS[item.kind];
}

export interface InventoryDialogProps {
  items: InventoryItem[];
  players: Pick<Player, 'id' | 'name'>[];
  playerId: string;
  onTake: (itemId: string) => void;
  onDrop: (itemId: string) => void;
  onClose: () => void;
}

/**
 * The room chest's contents (the gadgets inventory, phase 1) — opened by
 * walking up to the chest and pressing the interact key. Lists the fixed
 * catalog (`STARTING_INVENTORY`), each either in the chest or held by
 * someone; taking/dropping is the only mechanic this phase adds — each
 * gadget's own effect (the camera's flash, the flashlight's beam, …) lands
 * with that gadget. A DOM overlay over the WebGL canvas, same pattern as
 * `WhiteboardEditor`/`SoundboardAssignMenu`; the caller releases pointer
 * lock before showing it.
 */
export function InventoryDialog({
  items,
  players,
  playerId,
  onTake,
  onDrop,
  onClose,
}: InventoryDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="dialog" aria-label="The chest">
      <div className="inventory-dialog">
        <p className="modal-title">The chest</p>
        <p className="modal-hint">Small things worth bringing on a school trip.</p>
        <ul className="inventory-list">
          {items.map((item) => {
            const holder = item.heldBy ? players.find((p) => p.id === item.heldBy) : null;
            const heldByYou = item.heldBy === playerId;
            return (
              <li key={item.id} className="inventory-item">
                <div className="inventory-item-info">
                  <span className="inventory-item-name">{labelFor(item)}</span>
                  <span className="inventory-item-status">
                    {heldByYou
                      ? "You're holding this"
                      : holder
                        ? `Held by ${holder.name}`
                        : 'In the chest'}
                  </span>
                </div>
                {heldByYou ? (
                  <button type="button" onClick={() => onDrop(item.id)}>
                    Put back
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    disabled={item.heldBy !== null}
                    onClick={() => onTake(item.id)}
                  >
                    Take
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
