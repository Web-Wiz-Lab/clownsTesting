import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateTimeOptions, type TimeOption } from '@/lib/time';

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  minTime?: string | null;
  className?: string;
}

export function TimeSelect({ value, onChange, minTime = null, className }: TimeSelectProps) {
  const options = generateTimeOptions(minTime);

  // Group options by time of day
  const groupedOptions: Record<string, TimeOption[]> = {
    MORNING: [],
    AFTERNOON: [],
    EVENING: [],
  };

  options.forEach((option) => {
    groupedOptions[option.group].push(option);
  });

  // Capitalize group names nicely
  const groupLabels: Record<string, string> = {
    MORNING: 'Morning',
    AFTERNOON: 'Afternoon',
    EVENING: 'Evening',
  };

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder="Select time" />
      </SelectTrigger>
      <SelectContent side="bottom" position="popper" className="max-h-[400px]">
        {Object.entries(groupedOptions).map(([groupName, groupOptions]) =>
          groupOptions.length > 0 ? (
            <SelectGroup key={groupName}>
              <SelectLabel>{groupLabels[groupName]}</SelectLabel>
              {groupOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : null
        )}
      </SelectContent>
    </Select>
  );
}
