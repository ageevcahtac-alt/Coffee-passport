'use client';

import { useSyncExternalStore } from 'react';
import {
  subscribeCoffeeShops,
  getCoffeeShopsSnapshot,
  getCoffeeShopsServerSnapshot,
} from './coffeeShops';

export function useCoffeeShops() {
  return useSyncExternalStore(subscribeCoffeeShops, getCoffeeShopsSnapshot, getCoffeeShopsServerSnapshot);
}
