import { Text, TextInput, View } from 'react-native';

type Props = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

/** Native keeps a dependency-free fallback; the web implementation uses native HTML controls. */
export function MealDateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  return <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
    <View style={{ flex: 1 }}><Text style={{ color: '#A6A7A2', fontSize: 12, marginBottom: 6 }}>日期</Text><TextInput value={date} onChangeText={onDateChange} placeholder="YYYY-MM-DD" placeholderTextColor="#777872" style={{ color: '#F3F2ED', borderBottomWidth: 1, borderColor: '#6F706B', paddingVertical: 8 }} /></View>
    <View style={{ flex: 1 }}><Text style={{ color: '#A6A7A2', fontSize: 12, marginBottom: 6 }}>时间</Text><TextInput value={time} onChangeText={onTimeChange} placeholder="HH:MM" placeholderTextColor="#777872" style={{ color: '#F3F2ED', borderBottomWidth: 1, borderColor: '#6F706B', paddingVertical: 8 }} /></View>
  </View>;
}
