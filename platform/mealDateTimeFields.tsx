import { Text, TextInput, View } from 'react-native';

type Props = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

/** Native keeps a dependency-free fallback; the web implementation uses native HTML controls. */
export function MealDateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  return <View style={{ flexDirection: 'row', marginTop: 11, borderBottomWidth: 1, borderColor: '#6F706B', paddingVertical: 10 }}>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: '#A6A7A2', fontSize: 13, width: 34 }}>日期</Text><TextInput value={date} onChangeText={onDateChange} placeholder="YYYY-MM-DD" placeholderTextColor="#777872" style={{ color: '#F3F2ED', flex: 1, paddingVertical: 0 }} /></View>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 1, borderColor: '#6F706B', paddingLeft: 16 }}><Text style={{ color: '#A6A7A2', fontSize: 13, width: 34 }}>时间</Text><TextInput value={time} onChangeText={onTimeChange} placeholder="HH:MM" placeholderTextColor="#777872" style={{ color: '#F3F2ED', flex: 1, paddingVertical: 0 }} /></View>
  </View>;
}
