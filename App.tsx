import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert, Animated, AppState, GestureResponderEvent, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, useWindowDimensions, View,
} from 'react-native';
import { BRAND_SUBTITLE, BRAND_TITLE, initializeWithMinimum, SPLASH_FADE_MS } from './brandSplash';
import type { Meal, MealType, PhotoComposition, PhotoDimensions } from './domain/meal';
import { buildCalendarMonth, deriveHistory, isSameMonth, monthFromYearAndIndex, monthKey, parseJumpYear, shiftMonth } from './historyQuery';
import { getMealPhotoLayout, getPhotoContainerWidth, platformLayout } from './platform/layout';
import { PhotoGestureSurface } from './platform/photoGestureSurface';
import { photoInputAvailability } from './platform/photoInput';
import { startPwaRuntime } from './platform/pwaRuntime';
import { setShellBackground } from './platform/shellBackground';
import { confirmDelete } from './platform/confirmDelete';
import { MealDateTimeFields } from './platform/mealDateTimeFields';
import type { PhotoInputAsset } from './platform/photoInput';
import { getComposedImageLayout, hasIntrinsicDimensions, normalizePhoto } from './photoLayout';
import { mealRepository, photoRepository } from './storage';
import { backupAvailable, backupSource, createBackupPart, planBackup, restoreValidatedParts, saveBackupPart, validateRestore } from './storage/backup';

type Screen = 'today' | 'add' | 'history' | 'data';

const PAPER = '#F3F2ED';
const INK = '#20211F';
const DARK = '#262725';

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const defaultType = (): MealType => { const h = new Date().getHours(); return h < 10 ? '早餐' : h < 14 ? '午餐' : h < 21 ? '晚餐' : '加餐'; };
const dateLabel = (key: string) => { const d = new Date(`${key}T12:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const weekLabel = (key: string) => ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(`${key}T12:00:00`).getDay()];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function ComposedPhoto({ photo, frameWidth, frameHeight, onDimensionsResolved }: { photo: PhotoComposition; frameWidth: number; frameHeight: number; onDimensionsResolved?: (dimensions: PhotoDimensions) => void }) {
  const safePhoto = normalizePhoto(photo);
  const [resolvedUri, setResolvedUri] = useState<string | null>(() => photoRepository.resolvePhoto ? null : safePhoto.uri);
  const [resolvedDimensions, setResolvedDimensions] = useState<PhotoDimensions | null>(() => hasIntrinsicDimensions(safePhoto) ? { width: safePhoto.originalWidth, height: safePhoto.originalHeight } : null);
  useEffect(() => {
    let active = true;
    let retained = false;
    if (!photoRepository.resolvePhoto) { setResolvedUri(safePhoto.uri); return () => { active = false; }; }
    setResolvedUri(null);
    void photoRepository.resolvePhoto(safePhoto.uri).then((uri) => {
      if (!active) { if (uri) photoRepository.discardUnretainedPhoto?.(safePhoto.uri); return; }
      if (uri) { photoRepository.retainPhoto?.(safePhoto.uri); retained = true; }
      setResolvedUri(uri);
    });
    return () => { active = false; if (retained) photoRepository.releasePhoto?.(safePhoto.uri); };
  }, [safePhoto.uri]);
  useEffect(() => {
    if (hasIntrinsicDimensions(safePhoto)) {
      setResolvedDimensions({ width: safePhoto.originalWidth, height: safePhoto.originalHeight });
      return;
    }
    setResolvedDimensions(null);
  }, [safePhoto.originalHeight, safePhoto.originalWidth, safePhoto.uri]);
  if (!resolvedUri) return <View style={styles.photoFallback} />;
  if (!resolvedDimensions) {
    return <Image
      source={{ uri: resolvedUri }}
      resizeMode="cover"
      style={StyleSheet.absoluteFill}
      onLoad={(event) => {
        const next = event.nativeEvent.source;
        if (!hasIntrinsicDimensions(next)) return;
        const dimensions = { width: next.width, height: next.height };
        setResolvedDimensions(dimensions);
        onDimensionsResolved?.(dimensions);
      }}
    />;
  }
  const resolvedPhoto = { ...safePhoto, originalWidth: resolvedDimensions.width, originalHeight: resolvedDimensions.height };
  const layout = getComposedImageLayout(resolvedPhoto, frameWidth, frameHeight);
  return <Image
    source={{ uri: resolvedUri }}
    resizeMode="cover"
    style={{ position: 'absolute', ...layout }}
  />;
}

function MealPhotoGrid({ photos, onPhotoPress, onDimensionsResolved, renderOverlay, compactHeight }: { photos: PhotoComposition[]; onPhotoPress?: (index: number) => void; onDimensionsResolved?: (index: number, dimensions: PhotoDimensions) => void; renderOverlay?: (index: number) => ReactNode; compactHeight?: number }) {
  const count = photos.length;
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = getPhotoContainerWidth(windowWidth);
  if (!count) return null;
  const sourceLayout = getMealPhotoLayout(count, containerWidth);
  const scale = compactHeight ? Math.min(1, compactHeight / sourceLayout.height) : 1;
  const layout = scale === 1 ? sourceLayout : { height: sourceLayout.height * scale, frames: sourceLayout.frames.map((frame) => ({ ...frame, top: frame.top * scale, left: frame.left * scale, width: frame.width * scale, height: frame.height * scale })) };
  return <View key={`photo-layout-${count}`} style={[styles.photoGrid, { height: layout.height }]}>
    {photos.map((photo, index) => {
      const frame = layout.frames[index];
      return <View key={photo.uri} style={[styles.mealPhotoFrame, frame]}>
        <ComposedPhoto photo={photo} frameWidth={frame.width} frameHeight={frame.height} onDimensionsResolved={onDimensionsResolved ? (dimensions) => onDimensionsResolved(index, dimensions) : undefined} />
        {onPhotoPress ? <Pressable accessibilityRole="button" onPress={() => onPhotoPress(index)} style={StyleSheet.absoluteFill} /> : null}
        {renderOverlay?.(index)}
      </View>;
    })}
  </View>;
}

function Nav({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  return <View nativeID="app-bottom-nav" style={[styles.nav, platformLayout.nav]}>
    <Pressable accessibilityRole="button" hitSlop={12} onPress={() => go('today')}><Text style={[styles.navText, screen === 'today' && styles.activeNav]}>今天</Text></Pressable>
    <Pressable accessibilityRole="button" hitSlop={16} onPress={() => go('add')}><Text style={styles.plus}>＋</Text></Pressable>
    <Pressable accessibilityRole="button" hitSlop={12} onPress={() => go('history')}><Text style={[styles.navText, screen === 'history' && styles.activeNav]}>历史</Text></Pressable>
  </View>;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('today');
  const [meals, setMeals] = useState<Meal[]>([]);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [returnScreen, setReturnScreen] = useState<'today' | 'history'>('today');
  const [startup, setStartup] = useState<'loading' | 'fading' | 'ready' | 'error'>('loading');
  const [startupError, setStartupError] = useState<string | null>(null);
  const [orphanCandidates, setOrphanCandidates] = useState<string[] | null>(null);
  const splashOpacity = useRef(new Animated.Value(1)).current;
  const refresh = async () => { setMeals(await mealRepository.listMeals()); };
  const start = async () => {
    setStartup('loading');
    setStartupError(null);
    splashOpacity.setValue(1);
    const result = await initializeWithMinimum(mealRepository.initialize, mealRepository.listMeals);
    if (!result.ok) { setStartupError('无法打开本地记录，请重试。'); setStartup('error'); return; }
    setMeals(result.data);
    // Start the snapshot before the first interactive screen, but never wait for it.
    void photoRepository.getStartupOrphanCandidatePhotoIds?.().then(setOrphanCandidates).catch(() => {});
    setStartup('fading');
    Animated.timing(splashOpacity, { toValue: 0, duration: SPLASH_FADE_MS, useNativeDriver: true }).start(() => { setStartup('ready'); });
  };
  useEffect(() => { void start(); void startPwaRuntime(); }, []);
  useEffect(() => {
    if (startup !== 'ready' || !orphanCandidates?.length || !photoRepository.cleanupOrphans) return;
    const task = () => { void photoRepository.cleanupOrphans!(orphanCandidates).catch(() => {}); };
    const idle = globalThis as typeof globalThis & { requestIdleCallback?: (callback: () => void) => number; cancelIdleCallback?: (id: number) => void };
    const id = idle.requestIdleCallback ? idle.requestIdleCallback(task) : setTimeout(task, 400);
    return () => { if (idle.cancelIdleCallback && typeof id === 'number') idle.cancelIdleCallback(id); else clearTimeout(id as ReturnType<typeof setTimeout>); };
  }, [orphanCandidates, startup]);
  useLayoutEffect(() => { setShellBackground(startup === 'ready' && screen === 'add' ? 'dark' : 'light'); }, [screen, startup]);
  const today = meals.filter((meal) => meal.mealDate === dateKey()).sort((a, b) => a.mealTime.localeCompare(b.mealTime));
  const go = (next: Screen) => { if (next === 'add') { setEditingMeal(null); setReturnScreen('today'); } setScreen(next); };
  const edit = (meal: Meal, from: 'today' | 'history') => { setEditingMeal(meal); setReturnScreen(from); setScreen('add'); };
  if (startup === 'loading' || startup === 'fading') return <Animated.View style={[styles.brandSplash, platformLayout.brandSplash, { opacity: splashOpacity }]}><StatusBar style="dark" /><View style={styles.brandMark}><Text style={styles.brandTitle}>{BRAND_TITLE}</Text><View style={styles.brandRule} /><Text style={styles.brandSubtitle}>{BRAND_SUBTITLE}</Text></View><Text style={[styles.brandIndex, platformLayout.brandIndex]}>MEAL MEMORY · 01</Text></Animated.View>;
  if (startup === 'error') return <View style={[styles.startupError, platformLayout.startupError]}><StatusBar style="dark" /><Text style={styles.startupErrorTitle}>记录暂时没有打开</Text><Text style={styles.startupErrorCopy}>{startupError}</Text><Pressable accessibilityRole="button" onPress={() => void start()} style={styles.startupRetry}><Text style={styles.startupRetryText}>重试</Text></Pressable></View>;
  if (screen === 'add') return <AddMeal meal={editingMeal} onCancel={() => setScreen(returnScreen)} onSave={async () => { await refresh(); setEditingMeal(null); setScreen(returnScreen); }} onDelete={async () => { await refresh(); setEditingMeal(null); setScreen(returnScreen); }} />;
  if (screen === 'data') return <DataBackup meals={meals} onBack={() => setScreen('history')} />;
  return <View style={styles.app}><StatusBar style="dark" />
    {screen === 'today' ? <Today meals={today} onAdd={() => go('add')} onEdit={(meal) => edit(meal, 'today')} /> : <History meals={meals} onEdit={(meal) => edit(meal, 'history')} onDataBackup={() => setScreen('data')} />}
    <Nav screen={screen} go={go} />
  </View>;
}

function Today({ meals, onAdd, onEdit }: { meals: Meal[]; onAdd: () => void; onEdit: (meal: Meal) => void }) {
  return <ScrollView style={styles.screenScroll} contentContainerStyle={[styles.page, platformLayout.page]} showsVerticalScrollIndicator={false}>
    <View style={styles.topline}><Text style={styles.wordmark}>这一餐</Text><View style={styles.todayMark}><View style={styles.dot} /><Text style={styles.caption}>今天</Text></View></View>
    <View style={styles.dateBlock}><Text style={styles.bigDate}>{dateLabel(dateKey())}</Text><Text style={styles.week}>{weekLabel(dateKey())}</Text></View>
    <View style={styles.rule} />
    {meals.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>今天还没有留下照片</Text><Text style={styles.emptyCopy}>吃完这一餐，再慢慢记下来。</Text><Pressable onPress={onAdd} style={styles.emptyAction}><Text style={styles.emptyActionText}>添加第一餐</Text></Pressable></View> : meals.map((meal) => <MealItem key={meal.id} meal={meal} onPress={() => onEdit(meal)} />)}
  </ScrollView>;
}

function MealItem({ meal, onPress }: { meal: Meal; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.mealItem}><Text style={styles.mealMeta}>{meal.mealType} · {meal.mealTime}</Text><MealPhotoGrid photos={meal.photos} /><Text style={styles.foodText}>{meal.foodText}</Text>{meal.note ? <Text style={styles.note}>{meal.note}</Text> : null}<View style={styles.rule} /></Pressable>;
}

function History({ meals, onEdit, onDataBackup }: { meals: Meal[]; onEdit: (meal: Meal) => void; onDataBackup: () => void }) {
  const initialBatch = 50;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [monthJumpOpen, setMonthJumpOpen] = useState(false);
  const [jumpYear, setJumpYear] = useState(() => String(new Date().getFullYear()));
  const [visibleCount, setVisibleCount] = useState(initialBatch);
  const history = useMemo(() => deriveHistory(meals, searchQuery, selectedDate), [meals, searchQuery, selectedDate]);
  const calendarDays = useMemo(() => buildCalendarMonth(calendarMonth, history.datesWithMeals), [calendarMonth, history.datesWithMeals]);
  useEffect(() => { setVisibleCount(initialBatch); }, [history.mode, searchQuery, selectedDate]);
  const visibleMeals = useMemo(() => history.displayMeals.slice(0, visibleCount), [history.displayMeals, visibleCount]);
  const groups = useMemo(() => Array.from(new Set(visibleMeals.map((meal) => meal.mealDate))).map((date) => ({ date, meals: visibleMeals.filter((meal) => meal.mealDate === date).sort((a, b) => a.mealTime.localeCompare(b.mealTime)) })), [visibleMeals]);
  const updateSearch = (value: string) => { setSearchQuery(value); if (value.trim()) setSelectedDate(null); };
  const chooseDate = (date: string) => { setSearchQuery(''); setSelectedDate(date); setCalendarOpen(false); };
  const clearFilter = () => { setSearchQuery(''); setSelectedDate(null); };
  const moveCalendar = (delta: number) => { setCalendarMonth((month) => shiftMonth(month, delta)); setSelectedDate(null); };
  const openMonthJump = () => { setJumpYear(String(calendarMonth.getFullYear())); setMonthJumpOpen(true); };
  const jumpToMonth = (monthIndex: number) => { const year = parseJumpYear(jumpYear); if (year === null) return; const target = monthFromYearAndIndex(year, monthIndex); if (!target) return; setCalendarMonth(target); setSelectedDate(null); setMonthJumpOpen(false); };
  const returnToToday = () => { setCalendarMonth(new Date()); setSelectedDate(null); setMonthJumpOpen(false); };
  return <ScrollView style={styles.screenScroll} contentContainerStyle={[styles.page, platformLayout.page]} showsVerticalScrollIndicator={false}>
    <Text style={styles.wordmark}>这一餐</Text><Text style={styles.historyTitle}>往前翻</Text>
    <View style={styles.historyTools}><TextInput accessibilityLabel="搜索吃过什么" value={searchQuery} onChangeText={updateSearch} placeholder="搜索吃过什么" placeholderTextColor="#858680" style={styles.searchInput} returnKeyType="search" /><View style={styles.historyToolActions}>{searchQuery.length > 0 ? <Pressable hitSlop={10} onPress={() => setSearchQuery('')}><Text style={styles.historyToolText}>清空</Text></Pressable> : null}<Pressable hitSlop={10} onPress={() => setCalendarOpen((open) => !open)}><Text style={styles.historyToolText}>{calendarOpen ? '收起月历' : '按日期找'}</Text></Pressable></View></View>
    {calendarOpen ? <View style={styles.calendar}><View style={styles.calendarHeader}><Pressable hitSlop={12} onPress={() => moveCalendar(-1)}><Text style={styles.calendarArrow}>←</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="选择年月" hitSlop={10} onPress={openMonthJump} style={styles.calendarTitleButton}><Text style={styles.calendarTitle}>{calendarMonth.getFullYear()}年 {calendarMonth.getMonth() + 1}月⌄</Text></Pressable><Pressable hitSlop={12} onPress={() => moveCalendar(1)}><Text style={styles.calendarArrow}>→</Text></Pressable></View>{!isSameMonth(calendarMonth, new Date()) ? <Pressable onPress={returnToToday} style={styles.todayShortcut}><Text style={styles.historyToolText}>回到今天</Text></Pressable> : null}{monthJumpOpen ? <View style={styles.monthJumpPanel}><View style={styles.monthJumpTop}><TextInput accessibilityLabel="输入四位年份" value={jumpYear} onChangeText={setJumpYear} keyboardType="number-pad" maxLength={6} placeholder="年份" placeholderTextColor="#858680" style={styles.yearInput} /><Pressable hitSlop={10} onPress={() => setMonthJumpOpen(false)}><Text style={styles.historyToolText}>取消</Text></Pressable></View>{parseJumpYear(jumpYear) === null ? <Text style={styles.yearError}>请输入 1900–2100 的四位年份</Text> : null}<View style={styles.monthGrid}>{Array.from({ length: 12 }, (_, index) => <Pressable accessibilityRole="button" accessibilityLabel={`${index + 1}月`} disabled={parseJumpYear(jumpYear) === null} key={index} onPress={() => jumpToMonth(index)} style={styles.monthChoice}><Text style={[styles.monthChoiceText, parseJumpYear(jumpYear) === null && styles.monthChoiceDisabled]}>{index + 1}月</Text></Pressable>)}</View></View> : null}<View style={styles.calendarWeek}>{['日', '一', '二', '三', '四', '五', '六'].map((day) => <Text key={day} style={styles.calendarWeekday}>{day}</Text>)}</View><View style={styles.calendarGrid}>{calendarDays.map((day) => <Pressable accessibilityRole="button" accessibilityLabel={day.date} key={day.date} onPress={() => chooseDate(day.date)} style={[styles.calendarDay, selectedDate === day.date && styles.calendarDaySelected]}><Text style={[styles.calendarDayText, !day.inMonth && styles.calendarDayOutside, selectedDate === day.date && styles.calendarDayTextSelected]}>{day.day}</Text>{day.hasMeals ? <View style={styles.calendarDot} /> : null}</Pressable>)}</View></View> : null}
    <View style={[styles.rule, platformLayout.historyDivider]} />
    {history.mode === 'date' ? <View style={styles.historyContext}><Text style={styles.historyContextText}>{selectedDate?.slice(5).replace('-', '.')} 的记录</Text><Pressable hitSlop={10} onPress={clearFilter}><Text style={styles.historyToolText}>返回全部</Text></Pressable></View> : history.mode === 'search' ? <Text style={styles.historyContextText}>找到 {history.searchResults.length} 餐</Text> : null}
    {!groups.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>{history.mode === 'timeline' ? '还没有过去的餐次' : '没有找到这一餐'}</Text>{history.mode === 'timeline' ? <Text style={styles.emptyCopy}>从今天开始，慢慢留下一卷生活。</Text> : <Pressable onPress={clearFilter} style={styles.emptyAction}><Text style={styles.emptyActionText}>返回全部历史</Text></Pressable>}</View> : groups.map(({ date, meals: daily }) => <View key={date} style={styles.dayGroup}><View style={styles.dayHeading}><Text style={styles.dayNumber}>{date.slice(5).replace('-', '.')}</Text><Text style={styles.caption}>{weekLabel(date)}</Text></View>{daily.map((meal) => <Pressable accessibilityRole="button" onPress={() => onEdit(meal)} key={meal.id} style={styles.historyMeal}><MealPhotoGrid photos={meal.photos} /><Text style={styles.historyCaption}>{meal.mealType} · {meal.mealTime}　{meal.foodText}</Text></Pressable>)}<View style={styles.rule} /></View>)}
    {history.displayMeals.length > visibleCount ? <Pressable accessibilityRole="button" onPress={() => setVisibleCount((count) => count + initialBatch)} style={styles.loadMore}><Text style={styles.loadMoreText}>加载更多</Text></Pressable> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="数据与备份" onPress={onDataBackup} style={[styles.dataBackupEntry, platformLayout.dataBackupEntry]}><Text style={styles.dataBackupEntryText}>数据与备份</Text><Text style={styles.dataBackupEntryHint}>为以后的记录留一份副本</Text></Pressable>
  </ScrollView>;
}

type BackupDetail = 'backup' | 'restore' | null;
function DataBackup({ meals, onBack }: { meals: Meal[]; onBack: () => void }) {
  const [detail, setDetail] = useState<BackupDetail>(null);
  const [backupPlan, setBackupPlan] = useState<Awaited<ReturnType<typeof planBackup>> | null>(null);
  const [partIndex, setPartIndex] = useState(0);
  const [readyPart, setReadyPart] = useState<Awaited<ReturnType<typeof createBackupPart>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const photoCount = useMemo(() => meals.reduce((total, meal) => total + meal.photos.length, 0), [meals]);
  const prepareBackup = async () => {
    if (!backupAvailable || !backupSource || busy) return;
    setBusy(true); setMessage('正在计算备份分卷…');
    try { setBackupPlan(await planBackup(backupSource)); setPartIndex(0); setReadyPart(null); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : '备份暂时无法准备。'); } finally { setBusy(false); }
  };
  const preparePart = async (index = partIndex) => {
    if (!backupPlan || !backupSource || busy) return;
    setBusy(true); setMessage(`正在生成第 ${index + 1} / ${backupPlan.parts.length} 卷…`);
    try { setReadyPart(await createBackupPart(backupSource, backupPlan, index)); setMessage(''); } catch (error) { setMessage(error instanceof Error ? error.message : '这一卷暂时无法生成。'); } finally { setBusy(false); }
  };
  const savePart = async () => {
    if (!backupPlan || !readyPart || busy) return;
    setBusy(true);
    try {
      await saveBackupPart(readyPart.file);
      setReadyPart(null);
      if (partIndex + 1 < backupPlan.parts.length) { const next = partIndex + 1; setPartIndex(next); setMessage('上一卷已释放，请生成下一卷。'); }
      else setMessage('备份完成。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '这一卷暂时无法保存。'); } finally { setBusy(false); }
  };
  const selectRestore = () => {
    if (!backupAvailable || busy) return;
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.zip,application/zip'; input.multiple = true;
    input.onchange = () => { const files = Array.from(input.files ?? []); if (files.length) void restore(files); }; input.click();
  };
  const restore = async (files: File[]) => {
    if (!backupSource) return;
    setBusy(true); setMessage('正在验证全部备份分卷…');
    try { const valid = await validateRestore(files); setMessage('正在恢复…'); const result = await restoreValidatedParts(backupSource, valid); setMessage(`恢复完成：新增 ${result.added} 餐，跳过 ${result.skipped} 餐，冲突 ${result.conflicts} 餐。`); } catch (error) { setMessage(error instanceof Error ? error.message : '恢复暂时无法完成。'); } finally { setBusy(false); }
  };
  if (detail) {
    const isBackup = detail === 'backup';
    return <ScrollView style={styles.screenScroll} contentContainerStyle={[styles.dataPage, platformLayout.dataPage]} showsVerticalScrollIndicator={false}>
      <View style={styles.dataHeader}><Pressable accessibilityRole="button" accessibilityLabel="返回数据与备份" hitSlop={12} onPress={() => setDetail(null)}><Text style={styles.dataBack}>返回</Text></Pressable><Text style={styles.wordmark}>这一餐</Text></View>
      <Text style={styles.dataTitle}>{isBackup ? '备份这一餐' : '恢复备份'}</Text>
      <View style={styles.rule} />
      {isBackup ? <><Text style={styles.dataLead}>将照片和用餐记录整理成多个小型备份包，分批保存到网盘或其他位置。</Text><Text style={styles.dataCopy}>数据保存在本机，建议定期备份。</Text>{backupAvailable ? (backupPlan ? <View style={styles.preparing}><Text style={styles.preparingText}>备份共 {backupPlan.parts.length} 卷</Text>{readyPart ? <Pressable disabled={busy} onPress={() => void savePart()} style={styles.backupAction}><Text style={styles.backupActionTitle}>保存第 {partIndex + 1} / {backupPlan.parts.length} 卷</Text></Pressable> : <Pressable disabled={busy} onPress={() => void preparePart()} style={styles.backupAction}><Text style={styles.backupActionTitle}>{busy ? '正在生成…' : `生成第 ${partIndex + 1} / ${backupPlan.parts.length} 卷`}</Text></Pressable>}</View> : <Pressable disabled={busy} onPress={() => void prepareBackup()} style={styles.backupAction}><Text style={styles.backupActionTitle}>{busy ? '正在准备…' : '准备备份'}</Text></Pressable>) : <View style={styles.preparing}><Text style={styles.preparingText}>备份目前仅在网页版本可用</Text></View>}</> : <><Text style={styles.dataLead}>选择一套完整的备份分卷后，会先全部验证，再逐卷合并恢复。</Text><Text style={styles.dataCopy}>现有记录不会被覆盖。</Text>{backupAvailable ? <Pressable disabled={busy} onPress={selectRestore} style={styles.backupAction}><Text style={styles.backupActionTitle}>{busy ? '正在恢复…' : '选择备份分卷'}</Text></Pressable> : <View style={styles.preparing}><Text style={styles.preparingText}>恢复目前仅在网页版本可用</Text></View>}</>}
      {message ? <View style={styles.preparing}><Text style={styles.preparingText}>{message}</Text></View> : null}
    </ScrollView>;
  }
  return <ScrollView style={styles.screenScroll} contentContainerStyle={[styles.dataPage, platformLayout.dataPage]} showsVerticalScrollIndicator={false}>
    <View style={styles.dataHeader}><Pressable accessibilityRole="button" accessibilityLabel="返回历史" hitSlop={12} onPress={onBack}><Text style={styles.dataBack}>返回</Text></Pressable><Text style={styles.wordmark}>这一餐</Text></View>
    <Text style={styles.dataTitle}>数据与备份</Text>
    <View style={styles.rule} />
    <View style={styles.backupStatus}><Text style={styles.backupStatusLabel}>最近备份：从未备份</Text><Text style={styles.backupStatusCount}>{meals.length} 餐 · {photoCount} 张照片</Text></View>
    <Pressable accessibilityRole="button" onPress={() => setDetail('backup')} style={styles.backupAction}><Text style={styles.backupActionTitle}>备份这一餐</Text><Text style={styles.backupActionCopy}>将照片和用餐记录整理成备份文件，可保存到网盘或其他位置。</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={() => setDetail('restore')} style={styles.backupAction}><Text style={styles.backupActionTitle}>恢复备份</Text><Text style={styles.backupActionCopy}>从以前保存的「这一餐」备份中恢复记录。</Text></Pressable>
  </ScrollView>;
}

function PhotoComposer({ photo, onCancel, onDone, onDimensionsResolved }: { photo: PhotoComposition; onCancel: () => void; onDone: (photo: PhotoComposition) => void; onDimensionsResolved: (dimensions: PhotoDimensions) => void }) {
  useEffect(() => { setShellBackground('composer'); return () => setShellBackground('dark'); }, []);
  const { width: windowWidth } = useWindowDimensions();
  const frameWidth = Math.max(1, windowWidth - 40);
  const frameHeight = Math.max(1, Math.min(430, frameWidth * 1.12));
  const initialPhoto = normalizePhoto(photo);
  const [draft, setDraft] = useState(initialPhoto);
  const draftRef = useRef(initialPhoto);
  const startRef = useRef({ scale: initialPhoto.scale, offsetX: initialPhoto.offsetX, offsetY: initialPhoto.offsetY });
  const pinchDistanceRef = useRef(0);
  const updateDraft = (next: PhotoComposition) => { draftRef.current = next; setDraft(next); };
  const resolveDraftDimensions = (dimensions: PhotoDimensions) => {
    const next = { ...draftRef.current, originalWidth: dimensions.width, originalHeight: dimensions.height };
    updateDraft(next);
    onDimensionsResolved(dimensions);
  };
  const touchDistance = (event: GestureResponderEvent) => {
    const touches = event.nativeEvent.touches;
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => hasIntrinsicDimensions(draftRef.current),
    onMoveShouldSetPanResponder: () => hasIntrinsicDimensions(draftRef.current),
    onPanResponderGrant: (event) => {
      startRef.current = { scale: draftRef.current.scale, offsetX: draftRef.current.offsetX, offsetY: draftRef.current.offsetY };
      pinchDistanceRef.current = touchDistance(event);
    },
    onPanResponderMove: (event, gesture) => {
      const distance = touchDistance(event);
      if (distance > 0) {
        if (pinchDistanceRef.current <= 0) { pinchDistanceRef.current = distance; startRef.current.scale = draftRef.current.scale; }
        updateDraft({ ...draftRef.current, scale: clamp(startRef.current.scale * distance / pinchDistanceRef.current, 1, 4) });
        return;
      }
      const offsetX = clamp(startRef.current.offsetX + gesture.dx / (frameWidth / 2), -1, 1);
      const offsetY = clamp(startRef.current.offsetY + gesture.dy / (frameHeight / 2), -1, 1);
      updateDraft({ ...draftRef.current, offsetX, offsetY });
    },
    onPanResponderRelease: () => { pinchDistanceRef.current = 0; },
    onPanResponderTerminate: () => { pinchDistanceRef.current = 0; },
  }), [frameHeight, frameWidth]);
  return <View style={[styles.composerApp, platformLayout.composerApp]}><StatusBar style="light" />
    <View style={styles.composerHeader}><Pressable hitSlop={12} onPress={onCancel}><Text style={styles.composerAction}>取消</Text></Pressable><Text style={styles.composerTitle}>调整照片</Text><Pressable hitSlop={12} onPress={() => onDone(draft)}><Text style={styles.composerAction}>完成</Text></Pressable></View>
    <View style={styles.composerStage}><PhotoGestureSurface enabled={hasIntrinsicDimensions(draft)} frameWidth={frameWidth} frameHeight={frameHeight} nativeHandlers={panResponder.panHandlers} onChange={updateDraft} photo={draft} style={[styles.composerFrame, { width: frameWidth, height: frameHeight }]}><ComposedPhoto photo={draft} frameWidth={frameWidth} frameHeight={frameHeight} onDimensionsResolved={resolveDraftDimensions} /></PhotoGestureSurface><Text style={styles.composerHint}>双指缩放 · 拖动调整位置</Text></View>
  </View>;
}

function CameraScreen({ onCancel, onCaptured }: { onCancel: () => void; onCaptured: (photo: { uri: string; width?: number; height?: number }) => Promise<void> }) {
  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [capturing, setCapturing] = useState(false);
  useEffect(() => { setShellBackground('camera'); return () => setShellBackground('dark'); }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      setAppActive(active);
      if (!active) setCameraReady(false);
    });
    return () => subscription.remove();
  }, []);
  const capture = async () => {
    if (!cameraReady || !appActive || capturing) return;
    setCapturing(true);
    try {
      const photo = await camera.current?.takePictureAsync({ quality: 1 });
      if (photo) await onCaptured(photo);
    } finally {
      setCapturing(false);
    }
  };
  return <View style={styles.cameraWrap}><StatusBar style="light" />
    {appActive ? <CameraView ref={camera} style={styles.cameraPreview} facing="back" active mode="picture" onCameraReady={() => setCameraReady(true)} onMountError={({ message }) => { setCameraReady(false); Alert.alert('相机无法启动', message); }} /> : null}
    <Pressable onPress={onCancel} style={styles.cameraCancel}><Text style={styles.cameraText}>取消</Text></Pressable>
    <Pressable disabled={!cameraReady || capturing} onPress={capture} style={[styles.shutter, (!cameraReady || capturing) && styles.shutterDisabled]}><View /></Pressable>
  </View>;
}

function AddMeal({ meal, onCancel, onSave, onDelete }: { meal: Meal | null; onCancel: () => void; onSave: () => void; onDelete: () => Promise<void> }) {
  const nowAtOpen = useRef(new Date()).current;
  const draftIdentity = useRef(meal ? null : { id: `${nowAtOpen.getTime()}-${Math.random().toString(36).slice(2)}`, createdAt: nowAtOpen.toISOString() }).current;
  const [photos, setPhotos] = useState<PhotoComposition[]>(() => (meal?.photos ?? []).map(normalizePhoto)); const [food, setFood] = useState(meal?.foodText ?? ''); const [note, setNote] = useState(meal?.note ?? ''); const [type, setType] = useState<MealType>(meal?.mealType ?? defaultType()); const [mealDate, setMealDate] = useState(meal?.mealDate ?? dateKey(nowAtOpen)); const [mealTime, setMealTime] = useState(meal?.mealTime ?? timeKey(nowAtOpen)); const [cameraOpen, setCameraOpen] = useState(false); const [compositionIndex, setCompositionIndex] = useState<number | null>(null); const [saving, setSaving] = useState(false); const [deleting, setDeleting] = useState(false); const [permission, requestPermission] = useCameraPermissions(); const newPhotoUris = useRef(new Set<string>()); const initialPhotoUris = useRef(new Set((meal?.photos ?? []).map((photo) => normalizePhoto(photo).uri)));
  const deletePhotoFile = async (uri: string) => { try { await photoRepository.deletePhoto(uri); } catch { /* A failed cleanup must not corrupt the saved Meal. */ } };
  const cleanupNewPhotos = async () => { await Promise.all(Array.from(newPhotoUris.current).map(deletePhotoFile)); newPhotoUris.current.clear(); };
  const cancel = async () => { await cleanupNewPhotos(); onCancel(); };
  const persistPhotos = async (assets: Array<{ uri: string; width?: number; height?: number }>) => {
    await photoRepository.ensurePhotoDirectory();
    const stored = await Promise.all(assets.map((asset) => photoRepository.persistPhoto(asset)));
    stored.forEach((photo) => newPhotoUris.current.add(photo.uri));
    setPhotos((previous) => [...previous, ...stored].slice(0, 6));
  };
  const persistWebPhotos = async (assets: PhotoInputAsset[]) => {
    if (!photoRepository.persistBlob) throw new Error('当前浏览器无法保存照片。');
    const stored: PhotoComposition[] = [];
    try {
      for (const asset of assets) {
        stored.push(await photoRepository.persistBlob(asset.blob, {
          mimeType: asset.mimeType,
          originalWidth: asset.originalWidth,
          originalHeight: asset.originalHeight,
        }));
      }
    } catch (error) {
      await Promise.all(stored.map((photo) => deletePhotoFile(photo.uri)));
      throw error;
    }
    stored.forEach((photo) => newPhotoUris.current.add(photo.uri));
    setPhotos((previous) => [...previous, ...stored].slice(0, 6));
  };
  const runWebPhotoInput = async (load: () => Promise<PhotoInputAsset[]>) => {
    try {
      const selected = await load();
      if (selected.length) await persistWebPhotos(selected);
    } catch (error) {
      const message = error instanceof Error ? error.message : '照片没有保存，请重试。';
      Alert.alert('照片暂时无法使用', message);
    }
  };
  const choose = async () => {
    if (photoInputAvailability.selectPhotos) {
      await runWebPhotoInput(() => photoInputAvailability.selectPhotos!(Math.max(1, 6 - photos.length)));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 6 - photos.length), quality: 1 });
    if (!result.canceled) await persistPhotos(result.assets);
  };
  const openCamera = async () => {
    if (photoInputAvailability.capturePhoto) {
      await runWebPhotoInput(photoInputAvailability.capturePhoto);
      return;
    }
    const cameraPermission = permission?.granted ? permission : await requestPermission();
    if (!cameraPermission.granted) return Alert.alert('需要相机权限', '开启权限后即可拍下这一餐。');
    setCameraOpen(true);
  };
  const save = async () => {
    if (saving || deleting) return;
    if (!photos.length) return Alert.alert('先放一张照片', '一餐至少需要一张照片。');
    if (!food.trim()) return Alert.alert('写下吃了什么', '用一句话留住这一餐。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mealDate) || !/^\d{2}:\d{2}$/.test(mealTime)) return Alert.alert('日期或时间不正确', '请检查用餐日期和时间。');
    setSaving(true);
    try {
      const nextMeal: Meal = meal ? { ...meal, mealDate, mealTime, mealType: type, photos, foodText: food.trim(), note: note.trim() || null } : { id: draftIdentity!.id, createdAt: draftIdentity!.createdAt, mealDate, mealTime, mealType: type, photos, foodText: food.trim(), note: note.trim() || null };
      if (meal) await mealRepository.updateMeal(nextMeal); else await mealRepository.createMeal(nextMeal);
      const retainedUris = new Set(photos.map((photo) => photo.uri));
      const removedExistingPhotos = Array.from(initialPhotoUris.current).filter((uri) => !retainedUris.has(uri));
      await Promise.all(removedExistingPhotos.map(deletePhotoFile));
      newPhotoUris.current.clear();
      try { await onSave(); }
      catch { Alert.alert('记录已保存', '本地记录已经写入；列表刷新失败，请返回后重试查看。'); }
    } catch {
      Alert.alert('保存失败', '这条记录暂时没有保存，请重试。');
    } finally {
      setSaving(false);
    }
  };
  const deleteMeal = async () => {
    if (!meal || deleting || saving || !await confirmDelete()) return;
    setDeleting(true);
    try {
      await mealRepository.deleteMeal(meal.id);
      const cleanupUris = new Set([...initialPhotoUris.current, ...newPhotoUris.current, ...photos.map((photo) => photo.uri)]);
      await Promise.all(Array.from(cleanupUris).map(deletePhotoFile));
      newPhotoUris.current.clear();
      await onDelete();
    } catch {
      setDeleting(false);
      Alert.alert('删除失败', '这条记录暂时没有删除，请重试。');
    }
  };
  const removePhoto = async (index: number) => { const uri = photos[index].uri; setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); if (newPhotoUris.current.has(uri)) { newPhotoUris.current.delete(uri); await deletePhotoFile(uri); } };
  const move = (index: number, direction: -1 | 1) => { const next = [...photos]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setPhotos(next); };
  if (cameraOpen && permission?.granted) return <CameraScreen onCancel={() => setCameraOpen(false)} onCaptured={async (photo) => { await persistPhotos([photo]); setCameraOpen(false); }} />;
  if (compositionIndex !== null) return <PhotoComposer photo={photos[compositionIndex]} onCancel={() => setCompositionIndex(null)} onDimensionsResolved={(dimensions) => setPhotos((current) => current.map((item, index) => index === compositionIndex ? { ...item, originalWidth: dimensions.width, originalHeight: dimensions.height } : item))} onDone={(photo) => { setPhotos((current) => current.map((item, index) => index === compositionIndex ? photo : item)); setCompositionIndex(null); }} />;
  return <View style={styles.addApp}><StatusBar style="light" /><ScrollView style={styles.screenScroll} contentContainerStyle={[styles.addPage, platformLayout.addPage, styles.editorPage]} keyboardShouldPersistTaps="handled">
    <View style={styles.addNavigation}><Pressable hitSlop={12} onPress={cancel}><Text style={styles.addCancel}>取消</Text></Pressable></View>
    <Text style={[styles.addTitle, styles.editorTitle]}>{meal ? '编辑这一餐' : '添加一餐'}</Text><View style={styles.addRule} />
    <View style={[styles.addPhotoSection, styles.editorPhotoSection]}><Text style={styles.photoLabel}>照片</Text>{photos.length ? <MealPhotoGrid compactHeight={174} photos={photos} onPhotoPress={setCompositionIndex} onDimensionsResolved={(index, dimensions) => setPhotos((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, originalWidth: dimensions.width, originalHeight: dimensions.height } : item))} renderOverlay={(index) => <View style={[styles.photoControls, styles.editorPhotoControls]}><Pressable hitSlop={8} onPress={() => move(index, -1)}><Text style={[styles.photoControl, styles.editorPhotoControl]}>‹</Text></Pressable><Pressable hitSlop={8} onPress={() => removePhoto(index)}><Text style={[styles.remove, styles.editorRemove]}>×</Text></Pressable><Pressable hitSlop={8} onPress={() => move(index, 1)}><Text style={[styles.photoControl, styles.editorPhotoControl]}>›</Text></Pressable></View>} /> : <Pressable accessibilityRole="button" accessibilityLabel="选择照片" onPress={choose} style={styles.photoEmpty}><Text style={styles.photoEmptyText}>＋</Text></Pressable>}
      {photos.length > 0 && photos.length < 6 && (photoInputAvailability.enabled ? <View style={[styles.photoActions, styles.editorPhotoActions]}>{photoInputAvailability.showCameraAction && <Pressable onPress={openCamera} style={styles.photoAction}><Text style={styles.photoActionText}>拍照</Text></Pressable>}<Pressable onPress={choose} style={[styles.photoAction, styles.editorPhotoAction]}><Text style={[styles.photoActionText, styles.editorPhotoActionText]}>选择照片</Text></Pressable></View> : <Text style={styles.webPhotoPlaceholder}>{photoInputAvailability.message}</Text>)}</View>
    <TextInput value={food} onChangeText={setFood} placeholder="吃了什么？" placeholderTextColor="#92938E" multiline style={[styles.foodInput, styles.editorFoodInput]} />
    <MealDateTimeFields date={mealDate} time={mealTime} onDateChange={setMealDate} onTimeChange={setMealTime} />
    <View style={[styles.typeRow, styles.editorTypeRow]}>{(['早餐', '午餐', '晚餐', '加餐'] as MealType[]).map((item) => <Pressable key={item} onPress={() => setType(item)} style={[styles.typeChoice, styles.editorTypeChoice]}><Text style={[styles.typeText, styles.editorTypeText, type === item && styles.typeSelected]}>{item}{type === item ? '　●' : ''}</Text></Pressable>)}</View>
    <TextInput value={note} onChangeText={setNote} placeholder="备注（可选）" placeholderTextColor="#92938E" multiline style={[styles.noteInput, styles.editorNoteInput]} />
  </ScrollView><View nativeID="add-action-dock" style={[styles.addActionDock, platformLayout.addActionDock]}><Pressable disabled={saving || deleting} onPress={() => void save()} style={[styles.save, styles.editorSave, platformLayout.addSave, (saving || deleting) && styles.saveDisabled]}><Text style={[styles.saveText, styles.editorSaveText]}>{saving ? '正在保存…' : meal ? '保存修改' : '保存这一餐'}</Text></Pressable>{meal ? <Pressable accessibilityRole="button" disabled={deleting || saving} onPress={() => void deleteMeal()} style={[styles.deleteMeal, styles.editorDeleteMeal]}><Text style={[styles.deleteMealText, styles.editorDeleteMealText, (deleting || saving) && styles.deleteMealDisabled]}>{deleting ? '正在删除…' : '删除这一餐'}</Text></Pressable> : null}</View></View>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: PAPER }, screenScroll: { flex: 1, minHeight: 0, width: '100%' }, brandSplash: { flex: 1, backgroundColor: PAPER, justifyContent: 'center', paddingHorizontal: 34 }, brandMark: { marginTop: -48 }, brandTitle: { color: INK, fontSize: 54, fontWeight: '400', letterSpacing: -2.8 }, brandRule: { width: 38, height: 1, backgroundColor: '#B94F38', marginTop: 24, marginBottom: 20 }, brandSubtitle: { color: '#555650', fontSize: 16, lineHeight: 25, letterSpacing: 0.2 }, brandIndex: { position: 'absolute', left: 34, bottom: Platform.select({ ios: 50, default: 32 }), color: '#898A84', fontSize: 10, letterSpacing: 1.8 }, startupError: { flex: 1, backgroundColor: PAPER, justifyContent: 'center', paddingHorizontal: 34 }, startupErrorTitle: { color: INK, fontSize: 25, letterSpacing: -0.6 }, startupErrorCopy: { color: '#666762', fontSize: 15, lineHeight: 23, marginTop: 12 }, startupRetry: { alignSelf: 'flex-start', borderBottomWidth: 1, borderColor: INK, paddingBottom: 5, marginTop: 30 }, startupRetryText: { color: INK, fontSize: 16 }, page: { paddingTop: Platform.select({ ios: 70, default: 44 }), paddingHorizontal: 20, paddingBottom: 110 }, topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, wordmark: { fontSize: 18, color: INK, letterSpacing: -0.4 }, todayMark: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B94F38' }, caption: { color: INK, fontSize: 12 }, dateBlock: { marginTop: 46, flexDirection: 'row', alignItems: 'baseline', gap: 12 }, bigDate: { color: INK, fontSize: 48, letterSpacing: -2.5, fontWeight: '400' }, week: { color: INK, fontSize: 15 }, rule: { height: StyleSheet.hairlineWidth, backgroundColor: '#BDBEB7', marginTop: 18 }, mealItem: { paddingTop: 22 }, mealMeta: { color: INK, fontSize: 16, marginBottom: 12, letterSpacing: 0.2 }, photoGrid: { position: 'relative', width: '100%', overflow: 'hidden' }, mealPhotoFrame: { position: 'absolute', borderRadius: 4, backgroundColor: '#D7D6CF', overflow: 'hidden' }, photoFallback: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#5E605A' }, foodText: { color: INK, fontSize: 17, lineHeight: 26, marginTop: 18, letterSpacing: 0.1 }, note: { color: '#696A65', fontSize: 14, marginTop: 4 }, empty: { paddingTop: 76, alignItems: 'flex-start' }, emptyTitle: { fontSize: 21, color: INK, letterSpacing: -0.5 }, emptyCopy: { color: '#666762', marginTop: 10, fontSize: 15 }, emptyAction: { borderBottomWidth: 1, borderBottomColor: INK, marginTop: 30, paddingBottom: 5 }, emptyActionText: { color: INK, fontSize: 16 }, nav: { height: Platform.select({ ios: 84, default: 70 }), flexShrink: 0, width: '100%', paddingBottom: Platform.select({ ios: 24, default: 10 }), paddingHorizontal: 48, backgroundColor: PAPER, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navText: { fontSize: 16, color: '#656661' }, activeNav: { color: INK }, plus: { fontSize: 36, fontWeight: '200', color: INK, lineHeight: 40 }, historyTitle: { marginTop: 45, color: INK, fontSize: 48, letterSpacing: -2.5 }, historyTools: { marginTop: 25, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7', minHeight: 54, flexDirection: 'row', alignItems: 'center' }, searchInput: { flex: 1, color: INK, fontSize: 16, paddingVertical: 14, paddingHorizontal: 0 }, historyToolActions: { flexDirection: 'row', alignItems: 'center', gap: 16 }, historyToolText: { color: '#555650', fontSize: 13, letterSpacing: 0.2 }, historyContext: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 18 }, historyContextText: { color: '#666762', fontSize: 13, paddingTop: 18 }, calendar: { paddingTop: 22, paddingBottom: 6 }, calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 15 }, calendarTitleButton: { minWidth: 130, alignItems: 'center', paddingVertical: 4 }, calendarTitle: { color: INK, fontSize: 18, letterSpacing: 0.4 }, calendarArrow: { color: INK, fontSize: 19 }, todayShortcut: { alignSelf: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#777872', paddingBottom: 3, marginBottom: 14 }, monthJumpPanel: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7', paddingVertical: 15, marginBottom: 16 }, monthJumpTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, yearInput: { width: 132, color: INK, fontSize: 20, letterSpacing: 2, borderBottomWidth: 1, borderColor: INK, paddingVertical: 7, paddingHorizontal: 0 }, yearError: { color: '#8C4939', fontSize: 12, marginTop: 7 }, monthGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 13 }, monthChoice: { width: '25%', minHeight: 38, justifyContent: 'center', alignItems: 'center' }, monthChoiceText: { color: INK, fontSize: 14 }, monthChoiceDisabled: { color: '#B3B4AE' }, calendarWeek: { flexDirection: 'row', marginBottom: 5 }, calendarWeekday: { width: '14.2857%', textAlign: 'center', color: '#777872', fontSize: 11 }, calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' }, calendarDay: { width: '14.2857%', height: 42, alignItems: 'center', justifyContent: 'center' }, calendarDaySelected: { backgroundColor: INK, borderRadius: 2 }, calendarDayText: { color: INK, fontSize: 14 }, calendarDayOutside: { color: '#B3B4AE' }, calendarDayTextSelected: { color: PAPER }, calendarDot: { position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: '#B94F38' }, dayGroup: { paddingTop: 20 }, dayHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }, dayNumber: { color: INK, fontSize: 22, letterSpacing: 1 }, historyMeal: { marginBottom: 18 }, historyCaption: { marginTop: 18, color: INK, fontSize: 15, lineHeight: 22 }, composerApp: { flex: 1, backgroundColor: '#171816', paddingTop: Platform.select({ ios: 60, default: 36 }) }, composerHeader: { height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, composerAction: { color: '#F3F2ED', fontSize: 16 }, composerTitle: { color: '#F3F2ED', fontSize: 18 }, composerStage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 56 }, composerFrame: { overflow: 'hidden', backgroundColor: '#30312E' }, composerHint: { color: '#A6A7A2', fontSize: 13, marginTop: 18 }, addApp: { flex: 1, backgroundColor: DARK }, addPage: { paddingTop: Platform.select({ ios: 63, default: 38 }), paddingHorizontal: 20, paddingBottom: 42 }, addHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, addCancel: { color: '#F3F2ED', fontSize: 16 }, addTitle: { color: '#F3F2ED', fontSize: 21 }, addPhotoSection: { marginTop: 38, minHeight: 230, justifyContent: 'center' }, photoLead: { color: '#E6E6E0', fontSize: 25, letterSpacing: -0.7, marginBottom: 25 }, photoActions: { flexDirection: 'row', gap: 10, marginTop: 12 }, photoAction: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999A94', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 3 }, photoActionText: { color: '#F3F2ED', fontSize: 15 }, photoControls: { position: 'absolute', zIndex: 2, bottom: 5, left: 5, right: 5, backgroundColor: 'rgba(20,20,18,0.65)', borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between' }, photoControl: { color: '#fff', fontSize: 18 }, remove: { color: '#fff', fontSize: 21, lineHeight: 20 }, foodInput: { color: '#F3F2ED', fontSize: 27, lineHeight: 36, minHeight: 80, marginTop: 30, padding: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#8B8C87' }, typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 22 }, typeChoice: { width: '50%', minHeight: 42, justifyContent: 'center' }, typeText: { color: '#979892', fontSize: 16 }, typeSelected: { color: '#F3F2ED' }, noteInput: { color: '#F3F2ED', fontSize: 16, minHeight: 58, marginTop: 18, padding: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#6F706B' }, save: { marginTop: 34, backgroundColor: '#F3F2ED', borderRadius: 3, paddingVertical: 20, alignItems: 'center' }, saveText: { color: DARK, fontSize: 19 }, cameraWrap: { flex: 1, backgroundColor: '#000' }, cameraPreview: { flex: 1 }, cameraCancel: { position: 'absolute', top: 60, left: 24 }, cameraText: { color: '#fff', fontSize: 17 }, shutter: { position: 'absolute', bottom: 48, alignSelf: 'center', width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: '#fff', padding: 5 }, shutterDisabled: { opacity: 0.45 },
  deleteMeal: { alignSelf: 'center', marginTop: 54, marginBottom: 24, paddingVertical: 10, paddingHorizontal: 12 }, deleteMealText: { color: '#9A594A', fontSize: 14 }, deleteMealDisabled: { color: '#777872' }, saveDisabled: { opacity: 0.55 }, loadMore: { alignSelf: 'center', paddingVertical: 16, paddingHorizontal: 20, marginTop: 8 }, loadMoreText: { color: '#555650', fontSize: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#555650', paddingBottom: 3 }, dataBackupEntry: { marginTop: 34, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7' }, dataBackupEntryText: { color: '#555650', fontSize: 14 }, dataBackupEntryHint: { color: '#898A84', fontSize: 12, marginTop: 5 }, dataPage: { paddingTop: Platform.select({ ios: 70, default: 44 }), paddingHorizontal: 20, paddingBottom: 52, backgroundColor: PAPER, flexGrow: 1 }, dataHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dataBack: { color: '#555650', fontSize: 15 }, dataTitle: { color: INK, fontSize: 42, letterSpacing: -2.1, fontWeight: '400', marginTop: 46 }, backupStatus: { paddingVertical: 25, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7' }, backupStatusLabel: { color: INK, fontSize: 16 }, backupStatusCount: { color: '#777872', fontSize: 13, marginTop: 7 }, backupAction: { paddingVertical: 25, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7' }, backupActionTitle: { color: INK, fontSize: 19, letterSpacing: -0.2 }, backupActionCopy: { color: '#666762', fontSize: 14, lineHeight: 21, marginTop: 8, maxWidth: 310 }, dataLead: { color: INK, fontSize: 22, lineHeight: 34, letterSpacing: -0.5, marginTop: 30 }, dataCopy: { color: '#666762', fontSize: 15, lineHeight: 24, marginTop: 20 }, preparing: { alignSelf: 'flex-start', marginTop: 38 }, preparingText: { color: '#777872', fontSize: 13 }, webPhotoPlaceholder: { color: '#A6A7A2', fontSize: 13, lineHeight: 20 }, editorPage: {}, addNavigation: { minHeight: 28, justifyContent: 'center' }, editorTitle: { fontSize: 32, lineHeight: 39, letterSpacing: -1.2, marginTop: 24 }, addRule: { height: StyleSheet.hairlineWidth, backgroundColor: '#8B8C87', marginTop: 11 }, editorPhotoSection: { marginTop: 13, minHeight: 0, justifyContent: 'flex-start' }, photoLabel: { color: '#A6A7A2', fontSize: 13, marginBottom: 8 }, photoEmpty: { height: 132, backgroundColor: '#30312E', justifyContent: 'center', alignItems: 'center', borderRadius: 4 }, photoEmptyText: { color: '#A6A7A2', fontSize: 29, lineHeight: 32, fontWeight: '200' }, editorPhotoActions: { marginTop: 9, alignItems: 'flex-start' }, editorPhotoAction: { borderWidth: 0, paddingVertical: 0, paddingHorizontal: 0, minHeight: 36, justifyContent: 'center' }, editorPhotoActionText: { color: '#E6E6E0', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#999A94', paddingBottom: 3 }, editorPhotoControls: { bottom: 2, left: 4, right: 4, backgroundColor: 'transparent', paddingHorizontal: 4, paddingVertical: 0, opacity: 0.62 }, editorPhotoControl: { color: 'rgba(255,255,255,0.78)', fontSize: 16, lineHeight: 18 }, editorRemove: { color: 'rgba(255,255,255,0.78)', fontSize: 17, lineHeight: 18 }, editorFoodInput: { fontSize: 18, lineHeight: 24, minHeight: 36, marginTop: 14 }, editorTypeRow: { flexWrap: 'nowrap', marginTop: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#6F706B', paddingBottom: 9 }, editorTypeChoice: { width: '25%', minHeight: 30, alignItems: 'center' }, editorTypeText: { fontSize: 15 }, editorNoteInput: { color: '#C8C8C3', fontSize: 16, minHeight: 34, marginTop: 10 }, addActionDock: { flexShrink: 0, width: '100%', backgroundColor: DARK, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#6F706B', paddingHorizontal: 20, paddingTop: 11, paddingBottom: Platform.select({ ios: 14, default: 10 }) }, editorSave: { marginTop: 0, minHeight: 48, justifyContent: 'center' }, editorSaveText: { fontSize: 17 }, editorDeleteMeal: { alignSelf: 'stretch', minHeight: 44, marginTop: 7, marginBottom: 0, paddingVertical: 0, paddingHorizontal: 0, justifyContent: 'center', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#B94F38' }, editorDeleteMealText: { color: '#B94F38', fontSize: 14 },
});
