'use client';

import React from 'react';
import MenuGenerator from '@/components/MenuGenerator';

export default function NewMenuPage() {
  return (
    <div className="h-[calc(100dvh-52px)] overflow-y-auto bg-secondary-50">
      <div className="py-8 px-4">
        <MenuGenerator />
      </div>
    </div>
  );
}
