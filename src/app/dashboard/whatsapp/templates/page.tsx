'use client';

import { useState } from 'react';
import { FileText, Eye } from 'lucide-react';
import { DEFAULT_TEMPLATES, type WhatsAppTemplate } from '@/lib/whatsapp-templates';
import { useAppStore } from '@/store/app-store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function TemplatesPage() {
  const { salon } = useAppStore();
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editBody, setEditBody] = useState('');
  const [lang, setLang] = useState<'en' | 'ur'>('en');

  function openEditor(tpl: WhatsAppTemplate) {
    setSelectedTemplate(tpl);
    setEditBody(lang === 'en' ? tpl.bodyEn : tpl.bodyUr);
    setShowPreview(true);
  }

  function getPreview(body: string): string {
    const sampleVars: Record<string, string> = {
      client_name: 'Ayesha Malik',
      salon_name: salon?.name || 'Glamour Studio',
      branch_name: 'Gulberg Branch',
      branch_address: 'Plot 23, Main Boulevard, Gulberg III, Lahore',
      date: '15 Jan 2025',
      time: '3:30 PM',
      services: 'Hair Color, Haircut',
      stylist_name: 'Sadia',
      bill_number: 'BB-20250115-001',
      bill_items: 'Hair Color  Rs 2,500\nHaircut     Rs   500',
      bill_total: '3,000',
      payment_method: 'Cash',
      loyalty_points: '+30',
      udhaar_amount: '2,500',
      booking_link: `https://brbr.pk/book/${salon?.slug || 'glamour-studio'}`,
      total_revenue: '34,500',
      completed: '18',
      total: '22',
      cash: '18,200',
      jazzcash: '9,100',
      udhaar: '3,000',
      top_service: 'Hair Color',
      top_stylist: 'Sadia',
      product_list: '• Keune Color (3 left)\n• Wella Shampoo (2 left)',
    };
    let result = body;
    for (const [key, val] of Object.entries(sampleVars)) {
      result = result.replaceAll(`{${key}}`, val);
    }
    return result;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-xl font-bold">Message Templates</h2>
        <Tabs value={lang} onValueChange={(v) => setLang(v as 'en' | 'ur')}>
          <TabsList className="h-8"><TabsTrigger value="en" className="text-xs px-3">English</TabsTrigger><TabsTrigger value="ur" className="text-xs px-3">اردو</TabsTrigger></TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {DEFAULT_TEMPLATES.map((tpl) => (
          <Card key={tpl.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openEditor(tpl)}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gold" />
                  <p className="font-medium text-sm">{tpl.name}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1"><Eye className="w-3 h-3" /> Preview</Button>
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 font-sans">
                {lang === 'en' ? tpl.bodyEn : tpl.bodyUr}
              </pre>
              <div className="flex flex-wrap gap-1 mt-2">
                {tpl.variables.slice(0, 4).map((v) => (
                  <Badge key={v} variant="outline" className="text-[9px] font-mono">{`{${v}}`}</Badge>
                ))}
                {tpl.variables.length > 4 && <Badge variant="outline" className="text-[9px]">+{tpl.variables.length - 4} more</Badge>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Template Editor / Preview */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{selectedTemplate?.name}</DialogTitle></DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Variables (click to insert)</p>
                <div className="flex flex-wrap gap-1">
                  {selectedTemplate.variables.map((v) => (
                    <button key={v} onClick={() => setEditBody(editBody + `{${v}}`)}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-gold/30 bg-gold/5 text-gold hover:bg-gold/10 font-mono">
                      {`{${v}}`}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Message Body</p>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={8} className="font-mono text-xs" />
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Preview (with sample data)</p>
                <div className="p-3 bg-[#DCF8C6] rounded-lg text-sm whitespace-pre-wrap border border-green-500/25">
                  {getPreview(editBody)}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
