import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Typography } from '@/components/ui/Typography';
import { Select } from '@/components/ui/Select';

interface PlaceFormProps {
  formData: {
    name: string;
    website: string;
    description: string;
    location: string;
    waze_link: string;
    type: string;
  };
  onSubmit: (e: React.FormEvent) => void;
  onChange: (data: any) => void;
  onCancel: () => void;
  isEditing: boolean;
  isSaving?: boolean;
}

const placeTypes = [
  { value: '', label: 'כל הסוגים', emoji: '🏠' },
  { value: 'restaurant', label: 'מסעדה', emoji: '🍽️' },
  { value: 'cafe', label: 'בית קפה', emoji: '☕' },
  { value: 'bar', label: 'בר', emoji: '🍺' },
  { value: 'attraction', label: 'אטרקציה', emoji: '🎡' },
  { value: 'shopping', label: 'קניות', emoji: '🛍️' },
  { value: 'other', label: 'אחר', emoji: '📍' }
];

export function PlaceForm({ formData, onSubmit, onChange, onCancel, isEditing, isSaving }: PlaceFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="space-y-4">
        {/* Place Type */}
        <div>
          <Typography variant="body" className="font-medium mb-1">סוג המקום *</Typography>
          <Select
            value={formData.type}
            onChange={(value) => onChange({ ...formData, type: value })}
            options={placeTypes.map(type => ({
              value: type.value,
              label: `${type.emoji} ${type.label}`
            }))}
          />
          <Typography variant="body" className="text-sm text-secondary-500 mt-1">
            בחר את הקטגוריה המתאימה ביותר למקום
          </Typography>
        </div>

        {/* Place Name */}
        <div>
          <Typography variant="body" className="font-medium mb-1">שם המקום *</Typography>
          <Input
            required
            value={formData.name}
            onChange={(e) => onChange({ ...formData, name: e.target.value })}
            placeholder="לדוגמה: קפה לואיז"
            className="text-right"
          />
        </div>

        {/* Location */}
        <div>
          <Typography variant="body" className="font-medium mb-1">מיקום</Typography>
          <Input
            value={formData.location}
            onChange={(e) => onChange({ ...formData, location: e.target.value })}
            placeholder='לדוגמה: "תל אביב, מרכז" או "חיפה, צפון"'
            className="text-right"
          />
          <Typography variant="body" className="text-sm text-secondary-500 mt-1">
            מומלץ לציין עיר ואזור, מופרדים בפסיק
          </Typography>
        </div>

        {/* Links Section */}
        <div className="space-y-4 pt-2">
          <Typography variant="h4" className="text-secondary-900">קישורים</Typography>
          
          {/* Website */}
          <div>
            <Typography variant="body" className="font-medium mb-1">אתר אינטרנט</Typography>
            <Input
              value={formData.website}
              onChange={(e) => onChange({ ...formData, website: e.target.value })}
              placeholder="https://..."
              type="url"
              className="text-left ltr"
              dir="ltr"
            />
          </div>

          {/* Waze */}
          <div>
            <Typography variant="body" className="font-medium mb-1">קישור ל-Waze</Typography>
            <Input
              value={formData.waze_link}
              onChange={(e) => onChange({ ...formData, waze_link: e.target.value })}
              placeholder="https://waze.com/ul/..."
              type="url"
              className="text-left ltr"
              dir="ltr"
            />
            <Typography variant="body" className="text-sm text-secondary-500 mt-1">
              אפשר להעתיק את הקישור מאפליקציית Waze (שתף מיקום {'>'} העתק קישור)
            </Typography>
          </div>
        </div>

        {/* Description */}
        <div className="pt-2">
          <Typography variant="body" className="font-medium mb-1">תיאור</Typography>
          <textarea
            value={formData.description}
            onChange={(e) => onChange({ ...formData, description: e.target.value })}
            placeholder="ספר על המקום... למה כדאי לבקר? מה מיוחד?"
            className="w-full p-2 border border-secondary-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 min-h-[100px] text-right"
          />
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSaving}
        >
          ביטול
        </Button>
        <Button
          type="submit"
          isLoading={isSaving}
          disabled={isSaving}
        >
          {isEditing ? 'שמור שינויים' : 'הוסף המלצה'}
        </Button>
      </div>
    </form>
  );
}