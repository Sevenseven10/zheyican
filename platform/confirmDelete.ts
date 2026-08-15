import { Alert } from 'react-native';

export function confirmDelete(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      '删除这一餐？',
      '删除后，这一餐的照片和文字记录都会从本机移除，无法撤销。',
      [
        { text: '取消', style: 'cancel', onPress: () => resolve(false) },
        { text: '删除', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
