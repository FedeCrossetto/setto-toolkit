import type { SearchProvider } from './search'
import { notesSearchProvider } from '../plugins/notes/search'
import { snippetsSearchProvider } from '../plugins/snippets/search'
import { credentialsSearchProvider } from '../plugins/credentials/search'
import { gastosSearchProvider } from '../plugins/gastos/search'
import { fileEditorSearchProvider } from '../plugins/file-editor/search'
import { utilitiesSearchProvider } from '../plugins/utilities/search'
import { clipboardSearchProvider } from '../plugins/utilities/clipboard'
import { appearanceSearchProvider } from './search-appearance'
import { capturesSearchProvider } from '../plugins/captures/search'
import { commandsSearchProvider } from './search-commands'

// Register search providers for Ctrl+K here (one per plugin, see src/core/search.ts).
// Keep this list eager and light: providers must not import plugin UI components.
export const searchProviders: SearchProvider[] = [
  commandsSearchProvider,
  notesSearchProvider,
  snippetsSearchProvider,
  credentialsSearchProvider,
  gastosSearchProvider,
  fileEditorSearchProvider,
  utilitiesSearchProvider,
  clipboardSearchProvider,
  appearanceSearchProvider,
  capturesSearchProvider,
]
