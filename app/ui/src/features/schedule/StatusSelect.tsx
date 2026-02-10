import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StatusSelectProps {
  value: 'published' | 'planning';
  onChange: (value: 'published' | 'planning') => void;
  className?: string;
}

export function StatusSelect({ value, onChange, className }: StatusSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="published">Publish</SelectItem>
        <SelectItem value="planning">Unpublish</SelectItem>
      </SelectContent>
    </Select>
  );
}
