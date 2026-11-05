import React, { useRef } from 'react'
import { createStackNavigator } from '@react-navigation/stack'
import { NavigationContainer } from '@react-navigation/native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import RegisterScreen from './screens/RegisterScreen'
import StreamScreen from './screens/StreamScreen'

const Stack = createStackNavigator()

export default function App() {
  const wsRef = useRef<WebSocket | null>(null)
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Register">
            {(props) => <RegisterScreen {...props} wsRef={wsRef} />}
          </Stack.Screen>
          <Stack.Screen name="Stream">
            {(props) => <StreamScreen {...props} wsRef={wsRef} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </GestureHandlerRootView>
  )
}
