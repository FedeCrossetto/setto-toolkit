/**
 * Capa de íconos de la app.
 *
 * Todo el código importa íconos con nombres de `lucide-react`, pero Vite y
 * TypeScript resuelven ese módulo a ESTE archivo (alias en electron.vite.config.ts
 * y `paths` en tsconfig.web.json). Cada nombre se traduce a un ícono de Fluent UI
 * System Icons (los de Windows 11 y Office): Regular normal, Filled con
 * `weight="fill"` o `"bold"`. Los que Fluent no tiene (lenguajes de archivo,
 * spinners, logos) siguen en Phosphor con `make(P.…)`.
 *
 * - Cambiar el estilo global: `DEFAULT_WEIGHT` (light | regular | bold | fill; thin y duotone no
 *   se incluyen en el bundle: ver `phosphor-weights.ts`).
 * - Cambiar un ícono puntual: editar la tabla de abajo.
 * - Usar un ícono nuevo: agregarlo a la tabla (si falta, tsc falla en el import).
 */
import { forwardRef, type CSSProperties, type ForwardRefExoticComponent, type RefAttributes, type SVGProps } from 'react'
import * as P from '@phosphor-icons/react'
import type { Icon as PhosphorIcon, IconWeight } from '@phosphor-icons/react'
import { coerceWeight } from './phosphor-weights'
import type { FluentIcon } from '@fluentui/react-icons'
import {
  AddFilled, AddRegular, AlertFilled, AlertOnFilled, AlertOnRegular, AlertRegular, ArrowCounterclockwiseFilled, ArrowCounterclockwiseRegular, ArrowDownFilled, ArrowDownRegular, ArrowDownloadFilled, ArrowDownloadRegular, ArrowEnterLeftFilled, ArrowEnterLeftRegular, ArrowImportFilled, ArrowImportRegular, ArrowLeftFilled, ArrowLeftRegular, ArrowMaximizeVerticalFilled, ArrowMaximizeVerticalRegular, ArrowMinimizeFilled, ArrowMinimizeRegular, ArrowMinimizeVerticalFilled, ArrowMinimizeVerticalRegular, ArrowRepeatAllFilled, ArrowRepeatAllRegular, ArrowRightFilled, ArrowRightRegular, ArrowSortFilled, ArrowSortRegular, ArrowSwapFilled, ArrowSwapRegular, ArrowSyncFilled, ArrowSyncRegular, ArrowTrendingDownFilled, ArrowTrendingDownRegular, ArrowTrendingFilled, ArrowTrendingRegular, ArrowUndoFilled, ArrowUndoRegular, ArrowUpFilled, ArrowUpRegular, ArrowUpRightFilled, ArrowUpRightRegular, ArrowUploadFilled, ArrowUploadRegular, AttachFilled, AttachRegular, BookOpenFilled, BookOpenRegular, BookStarFilled, BookStarRegular, BookmarkAddFilled, BookmarkAddRegular, BotFilled, BotRegular, BracesVariableFilled, BracesVariableRegular, BrainCircuitFilled, BrainCircuitRegular, BranchCompareFilled, BranchCompareRegular, BranchFilled, BranchRegular, BuildingBankFilled, BuildingBankRegular, BuildingFilled, BuildingRegular, CalendarClockFilled, CalendarClockRegular, CalendarFilled, CalendarRegular, CameraFilled, CameraRegular, CaretDownFilled, CaretDownRegular, CheckmarkCircleFilled, CheckmarkCircleRegular, CheckmarkFilled, CheckmarkRegular, ChevronDownFilled, ChevronDownRegular, ChevronLeftFilled, ChevronLeftRegular, ChevronRightFilled, ChevronRightRegular, ChevronUpFilled, ChevronUpRegular, CircleFilled, CircleRegular, ClipboardTextLtrFilled, ClipboardTextLtrRegular, ClockFilled, ClockRegular, CloudArrowUpFilled, CloudArrowUpRegular, CloudCheckmarkFilled, CloudCheckmarkRegular, CloudOffFilled, CloudOffRegular, CodeFilled, CodeRegular, ColorFilled, ColorRegular, CopyAddFilled, CopyAddRegular, CopyFilled, CopyRegular, CropFilled, CropRegular, DataBarVerticalFilled, DataBarVerticalRegular, DatabaseFilled, DatabaseRegular, DeleteFilled, DeleteRegular, DesktopFilled, DesktopRegular, DismissFilled, DismissRegular, DocumentAddFilled, DocumentAddRegular, DocumentArrowDownFilled, DocumentArrowDownRegular, DocumentArrowUpFilled, DocumentArrowUpRegular, DocumentBulletListFilled, DocumentBulletListRegular, DocumentCssFilled, DocumentCssRegular, DocumentDataFilled, DocumentDataRegular, DocumentDatabaseFilled, DocumentDatabaseRegular, DocumentDismissFilled, DocumentDismissRegular, DocumentEditFilled, DocumentEditRegular, DocumentFilled, DocumentGlobeFilled, DocumentGlobeRegular, DocumentJavascriptFilled, DocumentJavascriptRegular, DocumentMarkdownFilled, DocumentMarkdownRegular, DocumentRegular, DocumentSearchFilled, DocumentSearchRegular, DocumentSettingsFilled, DocumentSettingsRegular, DocumentTextFilled, DocumentTextRegular, DropFilled, DropRegular, DumbbellFilled, DumbbellRegular, EditFilled, EditRegular, EraserFilled, EraserRegular, ErrorCircleFilled, ErrorCircleRegular, EyeFilled, EyeOffFilled, EyeOffRegular, EyeRegular, FilterFilled, FilterRegular, FingerprintFilled, FingerprintRegular, FireFilled, FireRegular, FlashFilled, FlashRegular, FolderAddFilled, FolderAddRegular, FolderFilled, FolderGlobeFilled, FolderGlobeRegular, FolderOpenFilled, FolderOpenRegular, FolderRegular, FolderSearchFilled, FolderSearchRegular, FoodFilled, FoodRegular, GaugeFilled, GaugeRegular, GlobeFilled, GlobeRegular, GridFilled, GridRegular, HardDriveFilled, HardDriveRegular, HighlightFilled, HighlightRegular, HistoryFilled, HistoryRegular, HomeFilled, HomeRegular, ImageMultipleFilled, ImageMultipleRegular, ImageOffFilled, ImageOffRegular, InfoFilled, InfoRegular, KeyFilled, KeyRegular, KeyboardFilled, KeyboardRegular, LayerFilled, LayerRegular, LinkDismissFilled, LinkDismissRegular, LinkFilled, LinkRegular, LiveFilled, LiveRegular, LockClosedFilled, LockClosedRegular, LockOpenFilled, LockOpenRegular, MathFormulaFilled, MathFormulaRegular, MentionFilled, MentionRegular, MoreHorizontalFilled, MoreHorizontalRegular, MoreVerticalFilled, MoreVerticalRegular, NotepadEditFilled, NotepadEditRegular, NumberSymbolFilled, NumberSymbolRegular, NumberSymbolSquareFilled, NumberSymbolSquareRegular, OpenFilled, OpenRegular, OptionsFilled, OptionsRegular, OrganizationFilled, OrganizationRegular, PanelLeftContractFilled, PanelLeftContractRegular, PanelLeftExpandFilled, PanelLeftExpandRegular, PanelLeftFilled, PanelLeftRegular, PauseFilled, PauseRegular, PaymentFilled, PaymentRegular, PenFilled, PenRegular, PersonFilled, PersonRegular, PhoneFilled, PhoneRegular, PinFilled, PinOffFilled, PinOffRegular, PinRegular, PlayFilled, PlayRegular, PlugConnectedFilled, PlugConnectedRegular, PlugDisconnectedFilled, PlugDisconnectedRegular, ProhibitedFilled, ProhibitedRegular, PulseFilled, PulseRegular, PuzzlePieceFilled, PuzzlePieceRegular, ReceiptFilled, ReceiptRegular, RecordStopFilled, RecordStopRegular, SaveFilled, SaveRegular, SavingsFilled, SavingsRegular, ScanTextFilled, ScanTextRegular, ScriptFilled, ScriptRegular, SearchFilled, SearchInfoFilled, SearchInfoRegular, SearchRegular, SendFilled, SendRegular, ServerFilled, ServerRegular, SettingsFilled, SettingsRegular, ShieldCheckmarkFilled, ShieldCheckmarkRegular, ShieldErrorFilled, ShieldErrorRegular, SignOutFilled, SignOutRegular, SparkleFilled, SparkleRegular, SplitVerticalFilled, SplitVerticalRegular, SquareFilled, SquareRegular, StarFilled, StarRegular, SubtractFilled, SubtractRegular, TableFilled, TableRegular, TagFilled, TagRegular, TextAlignLeftFilled, TextAlignLeftRegular, TextBulletListAddFilled, TextBulletListAddRegular, TextBulletListTreeFilled, TextBulletListTreeRegular, TextNumberListLtrFilled, TextNumberListLtrRegular, TextTFilled, TextTRegular, TextWrapFilled, TextWrapRegular, TextboxFilled, TextboxRegular, TicketDiagonalFilled, TicketDiagonalRegular, TimerFilled, TimerRegular, ToolboxFilled, ToolboxRegular, TvFilled, TvRegular, VehicleCarFilled, VehicleCarRegular, WalletFilled, WalletRegular, WandFilled, WandRegular, WarningFilled, WarningRegular, WeatherMoonFilled, WeatherMoonRegular, WeatherSunnyFilled, WeatherSunnyRegular, WindowConsoleFilled, WindowConsoleRegular, WrenchFilled, WrenchRegular, ZoomInFilled, ZoomInRegular,
} from '@fluentui/react-icons'

export const DEFAULT_WEIGHT: IconWeight = 'light'

export interface LucideProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string
  color?: string
  strokeWidth?: number | string
  absoluteStrokeWidth?: boolean
  className?: string
  style?: CSSProperties
  /** Extensión: peso Phosphor explícito (p. ej. 'fill' para el ítem activo). */
  weight?: IconWeight
}

export type LucideIcon = ForwardRefExoticComponent<LucideProps & RefAttributes<SVGSVGElement>>

function make(Icon: PhosphorIcon, fixedWeight?: IconWeight): LucideIcon {
  const C = forwardRef<SVGSVGElement, LucideProps>(function AppIcon(
    { size = 24, strokeWidth, absoluteStrokeWidth: _abs, weight, ...rest },
    ref,
  ) {
    const sw = typeof strokeWidth === 'string' ? parseFloat(strokeWidth) : strokeWidth
    const w = weight ?? fixedWeight ?? (sw !== undefined && sw >= 2.25 ? 'bold' : sw !== undefined && sw <= 1.25 ? 'light' : DEFAULT_WEIGHT)
    // Phosphor dibuja el glifo algo más chico que lucide en el mismo tamaño: compensar levemente.
    const px = typeof size === 'number' ? Math.round(size * 1.08) : size
    return <Icon ref={ref} size={px} weight={coerceWeight(w)} {...(rest as object)} />
  })
  return C as unknown as LucideIcon
}

/** Fluent: Regular, o Filled si se pide relleno (`weight="fill"`/`"bold"`, o fijo con `fixedWeight`). */
function makeF(Regular: FluentIcon, Filled: FluentIcon, fixedWeight?: IconWeight): LucideIcon {
  const C = forwardRef<SVGSVGElement, LucideProps>(function AppIcon(
    { size = 24, strokeWidth: _sw, absoluteStrokeWidth: _abs, weight, color, style, ...rest },
    _ref,
  ) {
    const w = weight ?? fixedWeight
    const Icon = w === 'fill' || w === 'bold' ? Filled : Regular
    // Los de Fluent sin tamaño fijo miden 1em: el tamaño va como font-size.
    return <Icon {...(rest as object)} primaryFill={color ?? 'currentColor'} style={{ fontSize: size, flexShrink: 0, ...style }} />
  })
  return C as unknown as LucideIcon
}

export const Activity = makeF(PulseRegular, PulseFilled)
export const AlertTriangle = makeF(WarningRegular, WarningFilled)
export const ArrowDown = makeF(ArrowDownRegular, ArrowDownFilled)
export const ArrowDownToLine = makeF(ArrowDownloadRegular, ArrowDownloadFilled)
export const ArrowLeftRight = makeF(ArrowSwapRegular, ArrowSwapFilled)
export const ArrowRight = makeF(ArrowRightRegular, ArrowRightFilled)
export const ArrowUpRight = makeF(ArrowUpRightRegular, ArrowUpRightFilled)
export const BarChart2 = makeF(DataBarVerticalRegular, DataBarVerticalFilled)
export const BookMarked = makeF(BookStarRegular, BookStarFilled)
export const BookOpen = makeF(BookOpenRegular, BookOpenFilled)
export const BookmarkPlus = makeF(BookmarkAddRegular, BookmarkAddFilled)
export const Bot = makeF(BotRegular, BotFilled)
export const Brain = makeF(BrainCircuitRegular, BrainCircuitFilled)
export const Building2 = makeF(BuildingRegular, BuildingFilled)
export const CalendarClock = makeF(CalendarClockRegular, CalendarClockFilled)
export const CalendarDays = makeF(CalendarRegular, CalendarFilled)
export const Car = makeF(VehicleCarRegular, VehicleCarFilled)
export const Check = makeF(CheckmarkRegular, CheckmarkFilled)
export const CheckCircle2 = makeF(CheckmarkCircleRegular, CheckmarkCircleFilled)
export const ChevronDown = makeF(ChevronDownRegular, ChevronDownFilled)
export const ChevronLeft = makeF(ChevronLeftRegular, ChevronLeftFilled)
export const ChevronRight = makeF(ChevronRightRegular, ChevronRightFilled)
export const ChevronUp = makeF(ChevronUpRegular, ChevronUpFilled)
export const Circle = makeF(CircleRegular, CircleFilled)
export const CircleAlert = makeF(ErrorCircleRegular, ErrorCircleFilled)
export const CircleStop = makeF(RecordStopRegular, RecordStopFilled)
export const ClipboardList = makeF(ClipboardTextLtrRegular, ClipboardTextLtrFilled)
export const Clock = makeF(ClockRegular, ClockFilled)
export const Code2 = makeF(CodeRegular, CodeFilled)
export const Columns2 = makeF(SplitVerticalRegular, SplitVerticalFilled)
export const Copy = makeF(CopyRegular, CopyFilled)
export const CopyPlus = makeF(CopyAddRegular, CopyAddFilled)
export const CornerDownLeft = makeF(ArrowEnterLeftRegular, ArrowEnterLeftFilled)
export const CreditCard = makeF(PaymentRegular, PaymentFilled)
export const Diff = makeF(BranchCompareRegular, BranchCompareFilled)
export const Download = makeF(ArrowDownloadRegular, ArrowDownloadFilled)
export const Droplets = makeF(DropRegular, DropFilled)
export const Dumbbell = makeF(DumbbellRegular, DumbbellFilled)
export const Eraser = makeF(EraserRegular, EraserFilled)
export const ExternalLink = makeF(OpenRegular, OpenFilled)
export const Eye = makeF(EyeRegular, EyeFilled)
export const EyeOff = makeF(EyeOffRegular, EyeOffFilled)
export const FileCode2 = makeF(DocumentBulletListRegular, DocumentBulletListFilled)
export const FileInput = makeF(DocumentArrowDownRegular, DocumentArrowDownFilled)
export const FilePlus = makeF(DocumentAddRegular, DocumentAddFilled)
export const FileSearch = makeF(DocumentSearchRegular, DocumentSearchFilled)
export const FileText = makeF(DocumentTextRegular, DocumentTextFilled)
export const FileUp = makeF(DocumentArrowUpRegular, DocumentArrowUpFilled)
export const FileX = makeF(DocumentDismissRegular, DocumentDismissFilled)
export const Filter = makeF(FilterRegular, FilterFilled)
export const Flame = makeF(FireRegular, FireFilled)
export const Folder = makeF(FolderRegular, FolderFilled)
export const FolderCog = makeF(FolderGlobeRegular, FolderGlobeFilled)
export const FolderOpen = makeF(FolderOpenRegular, FolderOpenFilled)
export const FolderPlus = makeF(FolderAddRegular, FolderAddFilled)
export const FolderSearch = makeF(FolderSearchRegular, FolderSearchFilled)
export const FolderTree = makeF(TextBulletListTreeRegular, TextBulletListTreeFilled)
// Íconos de archivo por lenguaje (misma familia y trazo; color del texto, sin colores de marca).
export const FileTsIcon        = makeF(DocumentJavascriptRegular, DocumentJavascriptFilled)
export const FileJsIcon        = makeF(DocumentJavascriptRegular, DocumentJavascriptFilled)
export const FileHtmlIcon      = makeF(DocumentGlobeRegular, DocumentGlobeFilled)
export const FileCssIcon       = makeF(DocumentCssRegular, DocumentCssFilled)
export const FileSqlIcon       = makeF(DocumentDatabaseRegular, DocumentDatabaseFilled)
export const FileMdIcon        = makeF(DocumentMarkdownRegular, DocumentMarkdownFilled)
export const FilePyIcon        = makeF(DocumentTextRegular, DocumentTextFilled)
export const FileCppIcon       = makeF(DocumentTextRegular, DocumentTextFilled)
export const FileCSharpIcon    = makeF(DocumentTextRegular, DocumentTextFilled)
export const FileRsIcon        = makeF(DocumentTextRegular, DocumentTextFilled)
export const FileIniIcon       = makeF(DocumentSettingsRegular, DocumentSettingsFilled)
export const FileTxtIcon       = makeF(DocumentRegular, DocumentFilled)
export const FileLinesIcon     = makeF(DocumentBulletListRegular, DocumentBulletListFilled)
export const FileCodeIcon      = makeF(DocumentDataRegular, DocumentDataFilled)
export const ChevronsDownUp = makeF(ArrowMinimizeVerticalRegular, ArrowMinimizeVerticalFilled)
export const Minimize2 = makeF(ArrowMinimizeRegular, ArrowMinimizeFilled)
export const FilePen = makeF(DocumentEditRegular, DocumentEditFilled)
export const Server = makeF(ServerRegular, ServerFilled)
export const ChevronsUpDown = makeF(ArrowMaximizeVerticalRegular, ArrowMaximizeVerticalFilled)
export const GitCompare = makeF(BranchCompareRegular, BranchCompareFilled)
export const Globe = makeF(GlobeRegular, GlobeFilled)
export const History = makeF(HistoryRegular, HistoryFilled)
export const House = makeF(HomeRegular, HomeFilled)
export const ImageOff = makeF(ImageOffRegular, ImageOffFilled)
export const Import = makeF(ArrowImportRegular, ArrowImportFilled)
export const Info = makeF(InfoRegular, InfoFilled)
export const KeyRound = makeF(KeyRegular, KeyFilled)
export const Keyboard = makeF(KeyboardRegular, KeyboardFilled)
export const Landmark = makeF(BuildingBankRegular, BuildingBankFilled)
export const LayoutGrid = makeF(GridRegular, GridFilled)
export const ListPlus = makeF(TextBulletListAddRegular, TextBulletListAddFilled)
export const Loader2           = make(P.SpinnerGap)
export const Layers = makeF(LayerRegular, LayerFilled)
export const FileSpreadsheet   = make(P.MicrosoftExcelLogo)
export const LoaderCircle      = make(P.CircleNotch)
export const Lock = makeF(LockClosedRegular, LockClosedFilled)
export const LockOpen = makeF(LockOpenRegular, LockOpenFilled)
export const LogOut = makeF(SignOutRegular, SignOutFilled)
export const Minus = makeF(SubtractRegular, SubtractFilled)
export const Monitor = makeF(DesktopRegular, DesktopFilled)
export const Moon = makeF(WeatherMoonRegular, WeatherMoonFilled)
export const MoreHorizontal = makeF(MoreHorizontalRegular, MoreHorizontalFilled, 'bold')
export const MoreVertical = makeF(MoreVerticalRegular, MoreVerticalFilled, 'bold')
export const Music             = make(P.MusicNotes)
export const Network = makeF(OrganizationRegular, OrganizationFilled)
export const NotebookPen = makeF(NotepadEditRegular, NotepadEditFilled)
export const Palette = makeF(ColorRegular, ColorFilled)
export const PanelLeft = makeF(PanelLeftRegular, PanelLeftFilled)
export const CaretDown = makeF(CaretDownRegular, CaretDownFilled)
export const PanelLeftClose = makeF(PanelLeftContractRegular, PanelLeftContractFilled)
export const PanelLeftOpen = makeF(PanelLeftExpandRegular, PanelLeftExpandFilled)
export const Paperclip = makeF(AttachRegular, AttachFilled)
export const Pause = makeF(PauseRegular, PauseFilled)
export const PenLine = makeF(PenRegular, PenFilled)
export const Pencil = makeF(EditRegular, EditFilled)
export const PiggyBank = makeF(SavingsRegular, SavingsFilled)
export const Pin = makeF(PinRegular, PinFilled)
export const PinOff = makeF(PinOffRegular, PinOffFilled)
export const Play = makeF(PlayRegular, PlayFilled)
export const Plug = makeF(PlugConnectedRegular, PlugConnectedFilled)
export const Unplug = makeF(PlugDisconnectedRegular, PlugDisconnectedFilled)
export const Table = makeF(TableRegular, TableFilled)
export const SquareFunction = makeF(MathFormulaRegular, MathFormulaFilled)
export const ScrollText = makeF(ScriptRegular, ScriptFilled)
export const ListTree = makeF(TextBulletListTreeRegular, TextBulletListTreeFilled)
export const TextCursorInput = makeF(TextboxRegular, TextboxFilled)
export const Database = makeF(DatabaseRegular, DatabaseFilled)
export const Settings2 = makeF(SettingsRegular, SettingsFilled)
export const Plus = makeF(AddRegular, AddFilled)
export const Puzzle = makeF(PuzzlePieceRegular, PuzzlePieceFilled)
export const Radio = makeF(LiveRegular, LiveFilled)
export const Receipt = makeF(ReceiptRegular, ReceiptFilled)
export const RefreshCw = makeF(ArrowSyncRegular, ArrowSyncFilled)
export const Replace = makeF(ArrowSwapRegular, ArrowSwapFilled)
export const RotateCcw = makeF(ArrowCounterclockwiseRegular, ArrowCounterclockwiseFilled)
export const Save = makeF(SaveRegular, SaveFilled)
export const Search = makeF(SearchRegular, SearchFilled)
export const SearchX = makeF(SearchInfoRegular, SearchInfoFilled)
export const Send = makeF(SendRegular, SendFilled)
export const SendHorizontal = makeF(SendRegular, SendFilled)
export const Settings = makeF(SettingsRegular, SettingsFilled)
export const ShieldCheck = makeF(ShieldCheckmarkRegular, ShieldCheckmarkFilled)
export const ShieldAlert = makeF(ShieldErrorRegular, ShieldErrorFilled)
export const Star = makeF(StarRegular, StarFilled)
export const CloudCheck = makeF(CloudCheckmarkRegular, CloudCheckmarkFilled)
export const CloudOff = makeF(CloudOffRegular, CloudOffFilled)
export const CloudUpload = makeF(CloudArrowUpRegular, CloudArrowUpFilled)
export const SlidersHorizontal = makeF(OptionsRegular, OptionsFilled)
export const Smartphone = makeF(PhoneRegular, PhoneFilled)
export const Sparkles = makeF(SparkleRegular, SparkleFilled)
export const Square = makeF(SquareRegular, SquareFilled)
export const SquareTerminal = makeF(WindowConsoleRegular, WindowConsoleFilled)
export const StopCircle = makeF(RecordStopRegular, RecordStopFilled)
export const Sun = makeF(WeatherSunnyRegular, WeatherSunnyFilled)
export const Terminal = makeF(WindowConsoleRegular, WindowConsoleFilled)
export const Ticket = makeF(TicketDiagonalRegular, TicketDiagonalFilled)
export const Trash2 = makeF(DeleteRegular, DeleteFilled)
export const TrendingDown = makeF(ArrowTrendingDownRegular, ArrowTrendingDownFilled)
export const TrendingUp = makeF(ArrowTrendingRegular, ArrowTrendingFilled)
export const TriangleAlert = makeF(WarningRegular, WarningFilled)
export const Tv = makeF(TvRegular, TvFilled)
export const Type = makeF(TextTRegular, TextTFilled)
export const Unlink = makeF(LinkDismissRegular, LinkDismissFilled)
export const Upload = makeF(ArrowUploadRegular, ArrowUploadFilled)
export const Ban = makeF(ProhibitedRegular, ProhibitedFilled)
export const AlignLeft = makeF(TextAlignLeftRegular, TextAlignLeftFilled)
export const ArrowUp = makeF(ArrowUpRegular, ArrowUpFilled)
export const Gauge = makeF(GaugeRegular, GaugeFilled)
export const GitBranch = makeF(BranchRegular, BranchFilled)
export const HardDrive = makeF(HardDriveRegular, HardDriveFilled)
export const User = makeF(PersonRegular, PersonFilled)
export const Utensils = makeF(FoodRegular, FoodFilled)
export const Wallet = makeF(WalletRegular, WalletFilled)
export const Wand2 = makeF(WandRegular, WandFilled)
export const Wifi              = make(P.WifiHigh)
export const WrapText = makeF(TextWrapRegular, TextWrapFilled)
export const Wrench = makeF(WrenchRegular, WrenchFilled)
export const X = makeF(DismissRegular, DismissFilled)
export const Zap = makeF(FlashRegular, FlashFilled)
export const ZoomIn = makeF(ZoomInRegular, ZoomInFilled)
export const ArrowLeft = makeF(ArrowLeftRegular, ArrowLeftFilled)
export const Camera = makeF(CameraRegular, CameraFilled)
export const ScanText = makeF(ScanTextRegular, ScanTextFilled)
export const ListOrdered = makeF(TextNumberListLtrRegular, TextNumberListLtrFilled)
export const Crop = makeF(CropRegular, CropFilled)
export const Undo2 = makeF(ArrowUndoRegular, ArrowUndoFilled)
export const Highlighter = makeF(HighlightRegular, HighlightFilled)
export const Grid3x3 = makeF(GridRegular, GridFilled)
export const Images = makeF(ImageMultipleRegular, ImageMultipleFilled)
export const AtSign = makeF(MentionRegular, MentionFilled)
export const Asterisk          = make(P.Asterisk)
export const Bell = makeF(AlertRegular, AlertFilled)
export const BellRing = makeF(AlertOnRegular, AlertOnFilled)
export const Binary = makeF(NumberSymbolSquareRegular, NumberSymbolSquareFilled)
export const Braces = makeF(BracesVariableRegular, BracesVariableFilled)
export const ClipboardText = makeF(ClipboardTextLtrRegular, ClipboardTextLtrFilled)
export const Fingerprint = makeF(FingerprintRegular, FingerprintFilled)
export const Hash = makeF(NumberSymbolRegular, NumberSymbolFilled)
export const Link = makeF(LinkRegular, LinkFilled)
export const Tag = makeF(TagRegular, TagFilled)
export const Timer = makeF(TimerRegular, TimerFilled)
export const Toolbox = makeF(ToolboxRegular, ToolboxFilled)
export const ArrowUpDown = makeF(ArrowSortRegular, ArrowSortFilled)
export const Repeat = makeF(ArrowRepeatAllRegular, ArrowRepeatAllFilled)
