import { Badge } from '@/components/ui/badge';

interface StatusBadgeProps {
  status: 'published' | 'planning';
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const isPublished = status === 'published';

  return (
    <Badge variant={isPublished ? 'success' : 'warning'} className="flex items-center gap-1.5">
      <span
        className={`h-2 w-2 rounded-full ${
          isPublished ? 'bg-success-100' : 'bg-warning-100'
        }`}
      />
      {isPublished ? 'Published' : 'Unpublished'}
    </Badge>
  );
}
