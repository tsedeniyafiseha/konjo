import { forwardRef } from 'react';
import {
  Platform,
  ScrollView,
  type ScrollViewProps,
} from 'react-native';

/**
 * Screen scroller defaults that keep focused form controls reachable while the
 * software keyboard is open and still cooperate with nested horizontal rails.
 */
export const KeyboardAwareScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function KeyboardAwareScrollView(
    {
      automaticallyAdjustKeyboardInsets = Platform.OS === 'ios',
      keyboardDismissMode = Platform.OS === 'ios' ? 'interactive' : 'on-drag',
      keyboardShouldPersistTaps = 'handled',
      nestedScrollEnabled = true,
      ...props
    },
    ref,
  ) {
    return (
      <ScrollView
        {...props}
        automaticallyAdjustKeyboardInsets={automaticallyAdjustKeyboardInsets}
        keyboardDismissMode={keyboardDismissMode}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        nestedScrollEnabled={nestedScrollEnabled}
        ref={ref}
      />
    );
  },
);
