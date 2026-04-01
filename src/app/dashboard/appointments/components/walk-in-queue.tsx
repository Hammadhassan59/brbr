'use client';

import { useState } from 'react';
import { UserPlus, Clock, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface WalkInEntry {
  id: string;
  tokenNumber: number;
  clientName: string;
  services: string;
  preferredStylist: string;
  addedAt: Date;
}

interface WalkInQueueProps {
  queue: WalkInEntry[];
  onAddWalkIn: (entry: Omit<WalkInEntry, 'id' | 'tokenNumber' | 'addedAt'>) => void;
  onAssign: (entry: WalkInEntry) => void;
  onRemove: (id: string) => void;
}

export function WalkInQueue({ queue, onAddWalkIn, onAssign, onRemove }: WalkInQueueProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [services, setServices] = useState('');
  const [stylist, setStylist] = useState('');

  function handleAdd() {
    onAddWalkIn({ clientName: name || 'Guest', services, preferredStylist: stylist });
    setName('');
    setServices('');
    setStylist('');
    setShowAddForm(false);
  }

  function getWaitEstimate(entry: WalkInEntry): string {
    const waitMs = Date.now() - entry.addedAt.getTime();
    const waitMin = Math.floor(waitMs / 60000);
    return waitMin < 1 ? 'Just now' : `${waitMin} min`;
  }

  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setSheetOpen(true)}>
        <UserPlus className="w-4 h-4" />
        Walk-ins ({queue.length})
      </Button>
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
      <SheetContent className="w-[350px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-heading">
            Walk-in Queue
            <Badge variant="secondary">{queue.length} waiting</Badge>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Add walk-in button / form */}
          {showAddForm ? (
            <div className="p-3 border rounded-lg space-y-2">
              <div>
                <Label className="text-xs">Client Name (optional)</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Guest"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Services needed</Label>
                <Input
                  value={services}
                  onChange={(e) => setServices(e.target.value)}
                  placeholder="e.g. Haircut, Color"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Preferred stylist (optional)</Label>
                <Input
                  value={stylist}
                  onChange={(e) => setStylist(e.target.value)}
                  placeholder="Any"
                  className="h-8 text-sm mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd} className="bg-gold text-black border border-gold text-xs">
                  Add to Queue
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(false)} className="text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setShowAddForm(true)}
              className="w-full bg-gold/10 text-gold hover:bg-gold/20 border border-gold/30"
            >
              <UserPlus className="w-4 h-4 mr-2" /> Add Walk-in
            </Button>
          )}

          {/* Queue list */}
          {queue.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">No walk-ins waiting</p>
          ) : (
            <div className="space-y-2">
              {queue.map((entry) => (
                <div key={entry.id} className="p-3 border rounded-lg bg-card">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-full bg-gold/20 text-gold text-lg font-bold flex items-center justify-center">
                        #{entry.tokenNumber}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{entry.clientName}</p>
                        <p className="text-xs text-muted-foreground">{entry.services || 'No services specified'}</p>
                      </div>
                    </div>
                    <button onClick={() => onRemove(entry.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>Waiting: {getWaitEstimate(entry)}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAssign(entry)}
                      className="text-xs gap-1"
                    >
                      Assign <ArrowRight className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}
