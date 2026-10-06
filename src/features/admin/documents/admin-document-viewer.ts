import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import type {
  AdminDocumentViewer,
  AdminDocumentViewTarget,
} from '@/application/admin-documents/admin-document-contracts';

export const expoAdminDocumentViewer: AdminDocumentViewer = {
  prepare(): AdminDocumentViewTarget {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const preview = window.open('about:blank', '_blank');
      if (!preview) {
        throw new Error('Allow pop-ups to open the private document preview.');
      }
      preview.opener = null;
      return {
        async open(url: string) {
          preview.location.replace(url);
        },
        cancel() {
          preview.close();
        },
      };
    }
    return {
      async open(url: string) {
        await WebBrowser.openBrowserAsync(url);
      },
      cancel() {},
    };
  },
};
