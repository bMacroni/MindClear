## Feature Brief: "Fly-Right & Celebrate" Task Interaction

**Context:**
We are building a polished task completion interaction in React Native.
**Goal:** When a user completes a task, the card should slide off-screen to the right, revealing a positive affirmation ("Great Job!", "Nice!", etc.) underneath. After a brief pause, the list should collapse smoothy.

### 1. Technical Stack
* **Framework:** React Native (Bare)
* **Animation:** `moti` (specifically `MotiView` and the `layout` prop).
* **Engine:** `react-native-reanimated`.
* **Icons:** `lucide-react-native` (for a checkmark or party icon in the celebration message).

### 2. Component Architecture: `<SwipeToCelebrate />`
This component will act as a wrapper around the individual Task Card.

**Visual Layers (Z-Index Strategy):**
1.  **Bottom Layer (The Celebration):** A view containing the "Great Job" text/icon. It sits *behind* the task card.
2.  **Top Layer (The Content):** The actual Task Card supplied via `children`.

### 3. Interaction Flow
1.  **Trigger:** User taps the "Complete" checkbox/button.
2.  **Phase 1: The Exit (0ms - 300ms)**
    * The **Top Layer** (Task Card) animates `translateX` off-screen to the right.
    * This reveals the **Bottom Layer** (Celebration Message) which is sitting underneath.
3.  **Phase 2: The Bask (300ms - 800ms)**
    * The user sees the "Great Job" message for ~500ms.
4.  **Phase 3: The Collapse (800ms+)**
    * The `onComplete` callback is fired to update the data.
    * **Crucial:** The component unmounts.
    * **Animation:** Use Moti's `layout={Layout.springing()}` on the *list container* or the item wrapper to make the surrounding tasks slide up specifically to fill the gap.

### 4. Implementation Instructions* **Structure:** Create a `<CelebratoryDismissal>` component.
* **Props:** `children`, `onComplete` (function), `messages` (optional array of strings to randomize feedback).
* **Animation Logic:**
    * Use `useSharedValue` for the slide position.
    * Use `runOnJS` to call the `onComplete` callback after the specific delay.
* **The "Clean Collapse":** Ensure the component implementation works well inside a standard `FlatList` or `ScrollView`.
* **Randomizer:** Simple logic to pick a random praise phrase ("Crushing it!", "Done!", "On Fire!") for the background layer.

### 5. Notes and Questions
* When using Moti for lists that "normalize beautifully" (collapse smoothly), there is one golden rule:

* Each item in your list MUST have a unique key. If you use index as a key (e.g., key={index}), the animation will look glitchy. Ensure your tasks have IDs (e.g., key={task.id}).

* Are you using a FlatList or a .map() inside a ScrollView for your current task list? (This affects how Cursor should write the "collapse" code).