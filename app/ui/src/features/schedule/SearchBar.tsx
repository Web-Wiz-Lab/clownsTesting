import { useState } from 'react';
import { format } from 'date-fns';
import { Calendar as CalendarIcon, Search, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  date: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  onSearch: (dateToSearch?: Date) => void;
  loading: boolean;
}

export function SearchBar({ date, onDateChange, onSearch, loading }: SearchBarProps) {
  const [open, setOpen] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && date && !loading) {
      onSearch();
    }
  };

  const handleDateSelect = (newDate: Date | undefined) => {
    onDateChange(newDate);
    setOpen(false);

    // Auto-trigger search when date is selected
    if (newDate && !loading) {
      // Pass the new date directly to avoid stale state
      onSearch(newDate);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Friendly instruction */}
      <div className="text-center">
        <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Sparkles className="h-4 w-4" />
          Pick a date to see who's working that day
        </p>
      </div>

      {/* Search controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="date-picker"
              variant="outline"
              className={cn(
                'flex-1 h-14 justify-start text-left text-base font-medium shadow-sm bg-white/90 hover:bg-white border-2',
                !date && 'text-muted-foreground',
                date && 'border-primary/30'
              )}
              onKeyDown={handleKeyDown}
            >
              <CalendarIcon className="mr-3 h-5 w-5 text-primary" />
              <span className="flex-1">
                {date ? format(date, 'EEEE, MMMM d, yyyy') : 'Choose a date...'}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>

        <Button
          onClick={() => onSearch()}
          disabled={!date || loading}
          size="lg"
          className={cn(
            'h-14 px-8 text-base font-semibold shadow-md sm:w-auto w-full',
            'bg-primary hover:bg-primary/90 transition-all',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            !loading && date && 'hover:scale-105 active:scale-95'
          )}
        >
          <Search className="mr-2 h-5 w-5" />
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
              Finding shifts...
            </span>
          ) : (
            'Find Shifts'
          )}
        </Button>
      </div>
    </div>
  );
}
