import type { ImgHTMLAttributes, ReactElement } from 'react';

interface ImageProps extends ImgHTMLAttributes<HTMLImageElement> {
 fill?: boolean;
 priority?: boolean;
 unoptimized?: boolean;
}

export default function Image({ fill, priority, unoptimized, ...props }: ImageProps): ReactElement {
 void fill; void priority; void unoptimized;
 return <img {...props} />;
}
