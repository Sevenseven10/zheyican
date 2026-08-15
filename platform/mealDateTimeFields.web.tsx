import { Text, View } from 'react-native';
import type { CSSProperties } from 'react';

type Props = {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
};

const inputStyle: CSSProperties = { color: '#F3F2ED', background: 'transparent', border: 0, borderRadius: 0, padding: 0, fontSize: 16, width: '100%', colorScheme: 'dark' };

export function MealDateTimeFields({ date, time, onDateChange, onTimeChange }: Props) {
  return <View style={{ flexDirection: 'row', marginTop: 11, borderBottomWidth: 1, borderColor: '#6F706B', paddingVertical: 10 }}>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}><Text style={{ color: '#A6A7A2', fontSize: 13, width: 34 }}>日期</Text><input aria-label="用餐日期" type="date" value={date} onChange={(event) => onDateChange(event.currentTarget.value)} style={inputStyle} /></View>
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 1, borderColor: '#6F706B', paddingLeft: 16 }}><Text style={{ color: '#A6A7A2', fontSize: 13, width: 34 }}>时间</Text><input aria-label="用餐时间" type="time" value={time} onChange={(event) => onTimeChange(event.currentTarget.value)} style={inputStyle} /></View>
  </View>;
}
