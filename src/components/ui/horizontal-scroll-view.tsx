import { forwardRef } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';

type WebWheelEvent = {
  currentTarget: {
    clientWidth: number;
    scrollLeft: number;
    scrollWidth: number;
  };
  nativeEvent: {
    deltaX: number;
    deltaY: number;
  };
  preventDefault(): void;
};

/**
 * A horizontal rail that can live inside a vertical screen scroller.
 *
 * Android needs nested scrolling enabled on the child, iOS benefits from
 * directional locking, and desktop web users expect a normal mouse wheel to
 * move the rail when it is the element under the pointer.
 */
export const HorizontalScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function HorizontalScrollView({ keyboardShouldPersistTaps = 'handled', ...props }, ref) {
    const webWheelProps = Platform.OS === 'web'
      ? ({
          onWheel: (event: WebWheelEvent) => {
            const { currentTarget, nativeEvent } = event;
            const canScroll = currentTarget.scrollWidth > currentTarget.clientWidth;
            if (!canScroll || Math.abs(nativeEvent.deltaX) >= Math.abs(nativeEvent.deltaY)) return;
            currentTarget.scrollLeft += nativeEvent.deltaY;
            event.preventDefault();
          },
        } as unknown as ScrollViewProps)
      : undefined;

    return (
      <ScrollView
        {...props}
        {...webWheelProps}
        directionalLockEnabled
        horizontal
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        nestedScrollEnabled
        ref={ref}
      />
    );
  },
);
