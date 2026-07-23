// useLocalChat — thin re-export.
//
// The stateful engine moved to context/LocalChatContext.tsx so the local chat
// session survives in-app navigation (the provider is mounted once in App(),
// above the manual router that unmounts pages on navigation). This file keeps the
// original import path stable for existing consumers (LocalChatView).

export {
  useLocalChat,
  LocalChatProvider,
  type UseLocalChat,
  type LocalMsg,
  type LocalChatRole,
} from '../context/LocalChatContext';
