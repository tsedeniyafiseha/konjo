import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';

interface KonjoIconProps {
  name: ComponentProps<typeof SymbolView>['name'];
  color: string;
  size?: number;
}

export function KonjoIcon({ name, color, size = 24 }: KonjoIconProps) {
  return <SymbolView name={name} size={size} tintColor={color} />;
}
