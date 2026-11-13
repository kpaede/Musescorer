import React from 'react';
export default function Image({ fill, priority, unoptimized, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean; unoptimized?: boolean }) {
 void fill; void priority; void unoptimized;
 return <img {...props} />;
}
