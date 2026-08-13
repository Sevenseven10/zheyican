import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, GestureResponderEvent, Image, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, useWindowDimensions, View,
} from 'react-native';
import { getComposedImageLayout, getMealPhotoLayout, hasIntrinsicDimensions, normalizePhoto, PhotoComposition, PhotoDimensions } from './photoLayout';

type MealType = '早餐' | '午餐' | '晚餐' | '加餐';
type Meal = { id: string; createdAt: string; mealDate: string; mealTime: string; mealType: MealType; photos: PhotoComposition[]; foodText: string; note: string | null };
type Screen = 'today' | 'add' | 'history';

const dbPromise = SQLite.openDatabaseAsync('meals.db');
const PAPER = '#F3F2ED';
const INK = '#20211F';
const DARK = '#262725';

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeKey = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const defaultType = (): MealType => { const h = new Date().getHours(); return h < 10 ? '早餐' : h < 14 ? '午餐' : h < 21 ? '晚餐' : '加餐'; };
const dateLabel = (key: string) => { const d = new Date(`${key}T12:00:00`); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const weekLabel = (key: string) => ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(`${key}T12:00:00`).getDay()];

async function initDb() {
  const db = await dbPromise;
  await db.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS meals (id TEXT PRIMARY KEY NOT NULL, createdAt TEXT NOT NULL, mealDate TEXT NOT NULL, mealTime TEXT NOT NULL, mealType TEXT NOT NULL, photos TEXT NOT NULL, foodText TEXT NOT NULL, note TEXT);');
}
async function readMeals() {
  const db = await dbPromise;
  const rows = await db.getAllAsync<Omit<Meal, 'photos'> & { photos: string }>('SELECT * FROM meals ORDER BY mealDate DESC, mealTime DESC');
  return rows.map((row) => ({ ...row, photos: parseStoredPhotos(row.photos) }));
}
function parseStoredPhotos(raw: unknown): PhotoComposition[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = []; }
  }
  const values = Array.isArray(parsed) ? parsed : parsed == null ? [] : [parsed];
  return values.map(normalizePhoto).filter((photo) => Boolean(photo.uri));
}
async function saveMeal(meal: Meal) {
  const db = await dbPromise;
  await db.runAsync('INSERT INTO meals (id, createdAt, mealDate, mealTime, mealType, photos, foodText, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', meal.id, meal.createdAt, meal.mealDate, meal.mealTime, meal.mealType, JSON.stringify(meal.photos), meal.foodText, meal.note);
}
async function updateMeal(meal: Meal) {
  const db = await dbPromise;
  await db.runAsync(
    'UPDATE meals SET mealType = ?, photos = ?, foodText = ?, note = ? WHERE id = ?',
    meal.mealType,
    JSON.stringify(meal.photos),
    meal.foodText,
    meal.note,
    meal.id,
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function ComposedPhoto({ photo, frameWidth, frameHeight, onDimensionsResolved }: { photo: PhotoComposition; frameWidth: number; frameHeight: number; onDimensionsResolved?: (dimensions: PhotoDimensions) => void }) {
  const safePhoto = normalizePhoto(photo);
  const [resolvedDimensions, setResolvedDimensions] = useState<PhotoDimensions | null>(() => hasIntrinsicDimensions(safePhoto) ? { width: safePhoto.originalWidth, height: safePhoto.originalHeight } : null);
  useEffect(() => {
    if (hasIntrinsicDimensions(safePhoto)) {
      setResolvedDimensions({ width: safePhoto.originalWidth, height: safePhoto.originalHeight });
      return;
    }
    setResolvedDimensions(null);
  }, [safePhoto.originalHeight, safePhoto.originalWidth, safePhoto.uri]);
  if (!safePhoto.uri) return <View style={styles.photoFallback} />;
  if (!resolvedDimensions) {
    return <Image
      source={{ uri: safePhoto.uri }}
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
    source={{ uri: safePhoto.uri }}
    resizeMode="cover"
    style={{ position: 'absolute', ...layout }}
  />;
}

function PhotoGrid({ photos }: { photos: PhotoComposition[] }) {
  const count = photos.length;
  const { width: windowWidth } = useWindowDimensions();
  const containerWidth = Math.max(1, windowWidth - 40);
  if (!count) return null;
  const layout = getMealPhotoLayout(count, containerWidth);
  return <View key={`photo-layout-${count}`} style={[styles.photoGrid, { height: layout.height }]}>
    {photos.map((photo, index) => {
      const frame = layout.frames[index];
      return <View key={photo.uri} style={[styles.mealPhotoFrame, frame]}>
        <ComposedPhoto photo={photo} frameWidth={frame.width} frameHeight={frame.height} />
      </View>;
    })}
  </View>;
}

function Nav({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  return <View style={styles.nav}>
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
  const [ready, setReady] = useState(false);
  const refresh = async () => { setMeals(await readMeals()); };
  useEffect(() => { initDb().then(refresh).finally(() => setReady(true)); }, []);
  const today = meals.filter((meal) => meal.mealDate === dateKey()).sort((a, b) => a.mealTime.localeCompare(b.mealTime));
  const go = (next: Screen) => { if (next === 'add') { setEditingMeal(null); setReturnScreen('today'); } setScreen(next); };
  const edit = (meal: Meal, from: 'today' | 'history') => { setEditingMeal(meal); setReturnScreen(from); setScreen('add'); };
  if (!ready) return <View style={styles.loading}><Text style={styles.caption}>整理今天的底片…</Text></View>;
  if (screen === 'add') return <AddMeal meal={editingMeal} onCancel={() => setScreen(returnScreen)} onSave={async () => { await refresh(); setEditingMeal(null); setScreen(returnScreen); }} />;
  return <View style={styles.app}><StatusBar style="dark" />
    {screen === 'today' ? <Today meals={today} onAdd={() => go('add')} onEdit={(meal) => edit(meal, 'today')} /> : <History meals={meals} onEdit={(meal) => edit(meal, 'history')} />}
    <Nav screen={screen} go={go} />
  </View>;
}

function Today({ meals, onAdd, onEdit }: { meals: Meal[]; onAdd: () => void; onEdit: (meal: Meal) => void }) {
  return <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <View style={styles.topline}><Text style={styles.wordmark}>这一餐</Text><View style={styles.todayMark}><View style={styles.dot} /><Text style={styles.caption}>今天</Text></View></View>
    <View style={styles.dateBlock}><Text style={styles.bigDate}>{dateLabel(dateKey())}</Text><Text style={styles.week}>{weekLabel(dateKey())}</Text></View>
    <View style={styles.rule} />
    {meals.length === 0 ? <View style={styles.empty}><Text style={styles.emptyTitle}>今天还没有留下照片</Text><Text style={styles.emptyCopy}>吃完这一餐，再慢慢记下来。</Text><Pressable onPress={onAdd} style={styles.emptyAction}><Text style={styles.emptyActionText}>添加第一餐</Text></Pressable></View> : meals.map((meal) => <MealItem key={meal.id} meal={meal} onPress={() => onEdit(meal)} />)}
  </ScrollView>;
}

function MealItem({ meal, onPress }: { meal: Meal; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.mealItem}><Text style={styles.mealMeta}>{meal.mealType} · {meal.mealTime}</Text><PhotoGrid photos={meal.photos} /><Text style={styles.foodText}>{meal.foodText}</Text>{meal.note ? <Text style={styles.note}>{meal.note}</Text> : null}<View style={styles.rule} /></Pressable>;
}

function History({ meals, onEdit }: { meals: Meal[]; onEdit: (meal: Meal) => void }) {
  const groups = useMemo(() => Array.from(new Set(meals.map((m) => m.mealDate))).map((date) => ({ date, meals: meals.filter((m) => m.mealDate === date).sort((a, b) => a.mealTime.localeCompare(b.mealTime)) })), [meals]);
  return <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
    <Text style={styles.wordmark}>这一餐</Text><Text style={styles.historyTitle}>往前翻</Text><View style={styles.rule} />
    {!groups.length ? <View style={styles.empty}><Text style={styles.emptyTitle}>还没有过去的餐次</Text><Text style={styles.emptyCopy}>从今天开始，慢慢留下一卷生活。</Text></View> : groups.map(({ date, meals: daily }) => <View key={date} style={styles.dayGroup}><View style={styles.dayHeading}><Text style={styles.dayNumber}>{date.slice(5).replace('-', '.')}</Text><Text style={styles.caption}>{weekLabel(date)}</Text></View>{daily.map((meal) => <Pressable accessibilityRole="button" onPress={() => onEdit(meal)} key={meal.id} style={styles.historyMeal}><PhotoGrid photos={meal.photos} /><Text style={styles.historyCaption}>{meal.mealType} · {meal.mealTime}　{meal.foodText}</Text></Pressable>)}<View style={styles.rule} /></View>)}
  </ScrollView>;
}

function PhotoComposer({ photo, onCancel, onDone, onDimensionsResolved }: { photo: PhotoComposition; onCancel: () => void; onDone: (photo: PhotoComposition) => void; onDimensionsResolved: (dimensions: PhotoDimensions) => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const frameWidth = Math.max(1, windowWidth - 40);
  const frameHeight = Math.max(1, Math.min(430, frameWidth * 1.12));
  const [draft, setDraft] = useState(photo);
  const draftRef = useRef(photo);
  const startRef = useRef({ scale: photo.scale, offsetX: photo.offsetX, offsetY: photo.offsetY });
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
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
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
  return <View style={styles.composerApp}><StatusBar style="light" />
    <View style={styles.composerHeader}><Pressable hitSlop={12} onPress={onCancel}><Text style={styles.composerAction}>取消</Text></Pressable><Text style={styles.composerTitle}>调整照片</Text><Pressable hitSlop={12} onPress={() => onDone(draft)}><Text style={styles.composerAction}>完成</Text></Pressable></View>
    <View style={styles.composerStage}><View {...panResponder.panHandlers} style={[styles.composerFrame, { width: frameWidth, height: frameHeight }]}><ComposedPhoto photo={draft} frameWidth={frameWidth} frameHeight={frameHeight} onDimensionsResolved={resolveDraftDimensions} /></View><Text style={styles.composerHint}>双指缩放 · 拖动调整位置</Text></View>
  </View>;
}

function AddMeal({ meal, onCancel, onSave }: { meal: Meal | null; onCancel: () => void; onSave: () => void }) {
  const { width: windowWidth } = useWindowDimensions();
  const thumbnailSize = Math.max(1, (windowWidth - 48) * 0.488);
  const [photos, setPhotos] = useState<PhotoComposition[]>(() => (meal?.photos ?? []).map(normalizePhoto)); const [food, setFood] = useState(meal?.foodText ?? ''); const [note, setNote] = useState(meal?.note ?? ''); const [type, setType] = useState<MealType>(meal?.mealType ?? defaultType()); const [cameraOpen, setCameraOpen] = useState(false); const [compositionIndex, setCompositionIndex] = useState<number | null>(null); const [permission, requestPermission] = useCameraPermissions(); const camera = useRef<CameraView>(null); const newPhotoUris = useRef(new Set<string>()); const initialPhotoUris = useRef(new Set((meal?.photos ?? []).map((photo) => normalizePhoto(photo).uri)));
  const deletePhotoFile = async (uri: string) => { try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch { /* A failed cleanup must not corrupt the saved Meal. */ } };
  const cleanupNewPhotos = async () => { await Promise.all(Array.from(newPhotoUris.current).map(deletePhotoFile)); newPhotoUris.current.clear(); };
  const cancel = async () => { await cleanupNewPhotos(); onCancel(); };
  const persistPhotos = async (assets: Array<{ uri: string; width?: number; height?: number }>) => {
    const root = FileSystem.documentDirectory + 'meal-photos/'; await FileSystem.makeDirectoryAsync(root, { intermediates: true });
    const stored = await Promise.all(assets.map(async (asset) => {
      const uri = asset.uri;
      const ext = uri.split('.').pop()?.split('?')[0] || 'jpg';
      const target = `${root}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to: target });
      const suppliedDimensions = { width: asset.width ?? 0, height: asset.height ?? 0 };
      const dimensions = hasIntrinsicDimensions(suppliedDimensions) ? suppliedDimensions : { width: 0, height: 0 };
      const normalized = normalizePhoto({ uri: target, originalWidth: dimensions.width, originalHeight: dimensions.height });
      return normalized;
    }));
    stored.forEach((photo) => newPhotoUris.current.add(photo.uri));
    setPhotos((previous) => [...previous, ...stored].slice(0, 6));
  };
  const choose = async () => { const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: Math.max(1, 6 - photos.length), quality: 1 }); if (!result.canceled) await persistPhotos(result.assets); };
  const openCamera = async () => { if (!permission?.granted && !(await requestPermission()).granted) return Alert.alert('需要相机权限', '开启权限后即可拍下这一餐。'); setCameraOpen(true); };
  const capture = async () => { const photo = await camera.current?.takePictureAsync({ quality: 1 }); if (photo) { await persistPhotos([photo]); setCameraOpen(false); } };
  const save = async () => { if (!photos.length) return Alert.alert('先放一张照片', '一餐至少需要一张照片。'); if (!food.trim()) return Alert.alert('写下吃了什么', '用一句话留住这一餐。'); const now = new Date(); const nextMeal: Meal = meal ? { ...meal, mealType: type, photos, foodText: food.trim(), note: note.trim() || null } : { id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`, createdAt: now.toISOString(), mealDate: dateKey(now), mealTime: timeKey(now), mealType: type, photos, foodText: food.trim(), note: note.trim() || null }; if (meal) await updateMeal(nextMeal); else await saveMeal(nextMeal); const retainedUris = new Set(photos.map((photo) => photo.uri)); const removedExistingPhotos = Array.from(initialPhotoUris.current).filter((uri) => !retainedUris.has(uri)); await Promise.all(removedExistingPhotos.map(deletePhotoFile)); newPhotoUris.current.clear(); onSave(); };
  const removePhoto = async (index: number) => { const uri = photos[index].uri; setPhotos((current) => current.filter((_, itemIndex) => itemIndex !== index)); if (newPhotoUris.current.has(uri)) { newPhotoUris.current.delete(uri); await deletePhotoFile(uri); } };
  const move = (index: number, direction: -1 | 1) => { const next = [...photos]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setPhotos(next); };
  if (cameraOpen) return <Modal animationType="slide"><View style={styles.cameraWrap}><CameraView ref={camera} style={StyleSheet.absoluteFill} facing="back" /><Pressable onPress={() => setCameraOpen(false)} style={styles.cameraCancel}><Text style={styles.cameraText}>取消</Text></Pressable><Pressable onPress={capture} style={styles.shutter}><View /></Pressable></View></Modal>;
  if (compositionIndex !== null) return <PhotoComposer photo={photos[compositionIndex]} onCancel={() => setCompositionIndex(null)} onDimensionsResolved={(dimensions) => setPhotos((current) => current.map((item, index) => index === compositionIndex ? { ...item, originalWidth: dimensions.width, originalHeight: dimensions.height } : item))} onDone={(photo) => { setPhotos((current) => current.map((item, index) => index === compositionIndex ? photo : item)); setCompositionIndex(null); }} />;
  return <View style={styles.addApp}><StatusBar style="light" /><ScrollView contentContainerStyle={styles.addPage} keyboardShouldPersistTaps="handled">
    <View style={styles.addHeader}><Pressable onPress={cancel}><Text style={styles.addCancel}>取消</Text></Pressable><Text style={styles.addTitle}>{meal ? '编辑这一餐' : '添加一餐'}</Text><View style={{ width: 32 }} /></View>
    <View style={styles.addPhotoSection}>{photos.length ? <View style={styles.editorGrid}>{photos.map((photo, index) => <View key={photo.uri} style={styles.editPhoto}><Pressable onPress={() => setCompositionIndex(index)} style={StyleSheet.absoluteFill}><View style={styles.editImage}><ComposedPhoto photo={photo} frameWidth={thumbnailSize} frameHeight={thumbnailSize} onDimensionsResolved={(dimensions) => setPhotos((current) => current.map((item) => item.uri === photo.uri ? { ...item, originalWidth: dimensions.width, originalHeight: dimensions.height } : item))} /></View></Pressable><View style={styles.photoControls}><Pressable hitSlop={6} onPress={() => move(index, -1)}><Text style={styles.photoControl}>←</Text></Pressable><Pressable hitSlop={6} onPress={() => removePhoto(index)}><Text style={styles.remove}>×</Text></Pressable><Pressable hitSlop={6} onPress={() => move(index, 1)}><Text style={styles.photoControl}>→</Text></Pressable></View></View>)}</View> : <Text style={styles.photoLead}>先拍下这一餐</Text>}
      {photos.length < 6 && <View style={styles.photoActions}><Pressable onPress={openCamera} style={styles.photoAction}><Text style={styles.photoActionText}>拍照</Text></Pressable><Pressable onPress={choose} style={styles.photoAction}><Text style={styles.photoActionText}>从相册选择</Text></Pressable></View>}</View>
    <TextInput value={food} onChangeText={setFood} placeholder="吃了什么？" placeholderTextColor="#92938E" multiline style={styles.foodInput} />
    <View style={styles.typeRow}>{(['早餐', '午餐', '晚餐', '加餐'] as MealType[]).map((item) => <Pressable key={item} onPress={() => setType(item)} style={styles.typeChoice}><Text style={[styles.typeText, type === item && styles.typeSelected]}>{item}{type === item ? '　●' : ''}</Text></Pressable>)}</View>
    <TextInput value={note} onChangeText={setNote} placeholder="备注（可选）" placeholderTextColor="#92938E" multiline style={styles.noteInput} />
    <Pressable onPress={save} style={styles.save}><Text style={styles.saveText}>{meal ? '保存修改' : '保存这一餐'}</Text></Pressable>
  </ScrollView></View>;
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: PAPER }, loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER }, page: { paddingTop: Platform.select({ ios: 70, default: 44 }), paddingHorizontal: 20, paddingBottom: 110 }, topline: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, wordmark: { fontSize: 18, color: INK, letterSpacing: -0.4 }, todayMark: { flexDirection: 'row', alignItems: 'center', gap: 7 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B94F38' }, caption: { color: INK, fontSize: 12 }, dateBlock: { marginTop: 46, flexDirection: 'row', alignItems: 'baseline', gap: 12 }, bigDate: { color: INK, fontSize: 48, letterSpacing: -2.5, fontWeight: '400' }, week: { color: INK, fontSize: 15 }, rule: { height: StyleSheet.hairlineWidth, backgroundColor: '#BDBEB7', marginTop: 18 }, mealItem: { paddingTop: 22 }, mealMeta: { color: INK, fontSize: 16, marginBottom: 12, letterSpacing: 0.2 }, photoGrid: { position: 'relative', width: '100%', overflow: 'hidden' }, mealPhotoFrame: { position: 'absolute', borderRadius: 4, backgroundColor: '#D7D6CF', overflow: 'hidden' }, mealPhoto: { width: '100%', height: '100%' }, photoFallback: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: '#5E605A' }, foodText: { color: INK, fontSize: 17, lineHeight: 26, marginTop: 18, letterSpacing: 0.1 }, note: { color: '#696A65', fontSize: 14, marginTop: 4 }, empty: { paddingTop: 76, alignItems: 'flex-start' }, emptyTitle: { fontSize: 21, color: INK, letterSpacing: -0.5 }, emptyCopy: { color: '#666762', marginTop: 10, fontSize: 15 }, emptyAction: { borderBottomWidth: 1, borderBottomColor: INK, marginTop: 30, paddingBottom: 5 }, emptyActionText: { color: INK, fontSize: 16 }, nav: { height: Platform.select({ ios: 84, default: 70 }), paddingBottom: Platform.select({ ios: 24, default: 10 }), paddingHorizontal: 48, position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: PAPER, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#BDBEB7', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, navText: { fontSize: 16, color: '#656661' }, activeNav: { color: INK }, plus: { fontSize: 36, fontWeight: '200', color: INK, lineHeight: 40 }, historyTitle: { marginTop: 45, color: INK, fontSize: 48, letterSpacing: -2.5 }, dayGroup: { paddingTop: 20 }, dayHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }, dayNumber: { color: INK, fontSize: 22, letterSpacing: 1 }, historyMeal: { marginBottom: 18 }, historyCaption: { marginTop: 18, color: INK, fontSize: 15, lineHeight: 22 }, composerApp: { flex: 1, backgroundColor: '#171816', paddingTop: Platform.select({ ios: 60, default: 36 }) }, composerHeader: { height: 48, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, composerAction: { color: '#F3F2ED', fontSize: 16 }, composerTitle: { color: '#F3F2ED', fontSize: 18 }, composerStage: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 56 }, composerFrame: { overflow: 'hidden', backgroundColor: '#30312E' }, composerHint: { color: '#A6A7A2', fontSize: 13, marginTop: 18 }, addApp: { flex: 1, backgroundColor: DARK }, addPage: { paddingTop: Platform.select({ ios: 63, default: 38 }), paddingHorizontal: 20, paddingBottom: 42 }, addHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, addCancel: { color: '#F3F2ED', fontSize: 16 }, addTitle: { color: '#F3F2ED', fontSize: 21 }, addPhotoSection: { marginTop: 38, minHeight: 230, justifyContent: 'center' }, photoLead: { color: '#E6E6E0', fontSize: 25, letterSpacing: -0.7, marginBottom: 25 }, photoActions: { flexDirection: 'row', gap: 10, marginTop: 12 }, photoAction: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#999A94', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 3 }, photoActionText: { color: '#F3F2ED', fontSize: 15 }, editorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, editPhoto: { width: '48.8%', aspectRatio: 1, position: 'relative' }, editImage: { width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', backgroundColor: '#30312E' }, photoControls: { position: 'absolute', bottom: 5, left: 5, right: 5, backgroundColor: 'rgba(20,20,18,0.65)', borderRadius: 3, paddingHorizontal: 8, paddingVertical: 4, flexDirection: 'row', justifyContent: 'space-between' }, photoControl: { color: '#fff', fontSize: 18 }, remove: { color: '#fff', fontSize: 21, lineHeight: 20 }, foodInput: { color: '#F3F2ED', fontSize: 27, lineHeight: 36, minHeight: 80, marginTop: 30, padding: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#8B8C87' }, typeRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 22 }, typeChoice: { width: '50%', minHeight: 42, justifyContent: 'center' }, typeText: { color: '#979892', fontSize: 16 }, typeSelected: { color: '#F3F2ED' }, noteInput: { color: '#F3F2ED', fontSize: 16, minHeight: 58, marginTop: 18, padding: 0, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#6F706B' }, save: { marginTop: 34, backgroundColor: '#F3F2ED', borderRadius: 3, paddingVertical: 20, alignItems: 'center' }, saveText: { color: DARK, fontSize: 19 }, cameraWrap: { flex: 1, backgroundColor: '#000' }, cameraCancel: { position: 'absolute', top: 60, left: 24 }, cameraText: { color: '#fff', fontSize: 17 }, shutter: { position: 'absolute', bottom: 48, alignSelf: 'center', width: 70, height: 70, borderRadius: 35, borderWidth: 4, borderColor: '#fff', padding: 5 },
});
