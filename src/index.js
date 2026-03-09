import React, {
  useRef,
  useState,
  useCallback,
  useMemo,
  useEffect,
} from 'react';
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';

import style from './style';
import Column from './components/column';
import Repository from './handlers/repository';
import Utils from './commons/utils';

const SCROLL_THRESHOLD = 50;
const SCROLL_STEP = 30;

const DraggableBoard = ({
  repository,
  renderColumnWrapper,
  renderRow,
  columnWidth,
  accessoryRight,
  activeRowStyle,
  activeRowRotation = 8,
  xScrollThreshold = SCROLL_THRESHOLD,
  yScrollThreshold = SCROLL_THRESHOLD,
  dragSpeedFactor = 1.5,
  onRowPress = () => { },
  onDragStart = () => { },
  onDragEnd = () => { },
  loadMore = () => {},
  listFooterComponent,
  isLoadingMore = {},
  style: boardStyle,
  horizontal = true,
}) => {
  const [forceUpdate, setForceUpdate] = useState(false);
  const [hoverComponent, setHoverComponent] = useState(null);
  const [movingMode, setMovingMode] = useState(false);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const absoluteX = useSharedValue(0);
  const absoluteY = useSharedValue(0);
  const movingModeShared = useSharedValue(false);

  const scrollViewRef = useRef();
  const scrollOffset = useRef(0);
  const hoverRowItem = useRef();

  useEffect(() => {
    repository.setReload(() => setForceUpdate(prevState => !prevState));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep shared value in sync with React state for worklet access
  useEffect(() => {
    movingModeShared.value = movingMode;
  }, [movingMode, movingModeShared]);

  const listenRowChangeColumn = useCallback((fromColumnId, toColumnId) => {
    if (hoverRowItem.current) {
      hoverRowItem.current.columnId = toColumnId;
      hoverRowItem.current.oldColumnId = fromColumnId;
    }
  }, []);

  const handleRowPosition = useCallback(
    (x, y) => {
      if (hoverRowItem.current && (x || y)) {
        const columnAtPosition = repository.moveRow(
          hoverRowItem.current,
          x,
          y,
          listenRowChangeColumn,
        );

        if (columnAtPosition && scrollViewRef.current) {
          // handle scroll horizontal
          if (x + xScrollThreshold > Utils.deviceWidth) {
            scrollOffset.current += SCROLL_STEP;
            scrollViewRef.current.scrollTo({
              x: scrollOffset.current * dragSpeedFactor,
              y: 0,
              animated: true,
            });
            repository.measureColumnsLayout();
          } else if (x < xScrollThreshold) {
            scrollOffset.current -= SCROLL_STEP;
            scrollViewRef.current.scrollTo({
              x: scrollOffset.current / dragSpeedFactor,
              y: 0,
              animated: true,
            });
            repository.measureColumnsLayout();
          }
        }
      }
    },
    [repository, xScrollThreshold, dragSpeedFactor, listenRowChangeColumn],
  );

  const endDrag = useCallback(() => {
    translateX.value = 0;
    translateY.value = 0;
    absoluteX.value = 0;
    absoluteY.value = 0;

    setHoverComponent(null);
    setMovingMode(false);

    if (hoverRowItem.current) {
      if (onDragEnd) {
        onDragEnd(
          hoverRowItem.current.oldColumnId,
          hoverRowItem.current.columnId,
          hoverRowItem.current,
        );
        repository.updateOriginalData();
      }
      repository.showRow(hoverRowItem.current);
      hoverRowItem.current = null;
    }
  }, [translateX, translateY, absoluteX, absoluteY, onDragEnd, repository]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(movingMode ? [-1, 1] : [-20, 20])
        .activeOffsetY(movingMode ? [-1, 1] : [-10, 10])
        .onUpdate((e) => {
          translateX.value = e.translationX;
          translateY.value = e.translationY;
          absoluteX.value = e.absoluteX;
          absoluteY.value = e.absoluteY;
          if (movingModeShared.value) {
            runOnJS(handleRowPosition)(e.absoluteX, e.absoluteY);
          }
        })
        .onFinalize(() => {
          if (movingModeShared.value) {
            runOnJS(endDrag)();
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movingMode, handleRowPosition, endDrag],
  );

  const onScroll = event => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
  };

  const onScrollEnd = event => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
    repository.measureColumnsLayout();
  };

  const keyExtractor = useCallback(
    (item, index) => `${item.id}${item.name}${index}`,
    [],
  );

  const hoverAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${activeRowRotation}deg` },
    ],
  }));

  const renderHoverComponent = () => {
    if (hoverComponent && hoverRowItem.current) {
      const row = repository.findRow(hoverRowItem.current);

      if (row && row.layout) {
        const { x, y, width, height } = row.layout;
        const hoverStyle = [
          style.hoverComponent,
          activeRowStyle,
          hoverAnimatedStyle,
          {
            top: y - yScrollThreshold,
            left: x,
            width,
            height,
          },
        ];

        return (
          <Animated.View style={hoverStyle}>{hoverComponent}</Animated.View>
        );
      }
    }
  };

  const moveItem = async (hoverItem, rowItem, isColumn = false) => {
    rowItem.setHidden(true);
    repository.hideRow(rowItem);
    await rowItem.measureLayout();
    hoverRowItem.current = { ...rowItem };

    setMovingMode(true);
    setHoverComponent(hoverItem);
  };

  const drag = column => {
    const hoverColumn = renderColumnWrapper({
      move: moveItem,
      item: column.data,
      index: column.index,
    });
    moveItem(hoverColumn, column, true);
  };

  const renderColumns = () => {
    const columns = repository.getColumns();
    return columns.map((column, index) => {
      const key = keyExtractor(column, index);

      const columnComponent = (
        <Column
          repository={repository}
          column={column}
          move={moveItem}
          renderColumnWrapper={renderColumnWrapper}
          keyExtractor={keyExtractor}
          renderRow={renderRow}
          scrollEnabled={!movingMode}
          columnWidth={columnWidth}
          onRowPress={onRowPress}
          onDragStartCallback={onDragStart}
          loadMore={loadMore}
          listFooterComponent={listFooterComponent}
          isLoadingMore={isLoadingMore}
        />
      );

      return renderColumnWrapper({
        item: column.data,
        index: column.index,
        columnComponent,
        drag: () => drag(column),
        layoutProps: {
          key,
          ref: ref => repository.updateColumnRef(column.id, ref),
          onLayout: layout => repository.updateColumnLayout(column.id),
        },
      });
    });
  };

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[style.container, boardStyle]}>
        <ScrollView
          ref={scrollViewRef}
          scrollEnabled={!movingMode}
          horizontal={horizontal}
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          onScrollEndDrag={onScrollEnd}
          onMomentumScrollEnd={onScrollEnd}>
          {renderColumns()}
          {Utils.isFunction(accessoryRight) ? accessoryRight() : accessoryRight}
        </ScrollView>
        {renderHoverComponent()}
      </Animated.View>
    </GestureDetector>
  );
};

export default DraggableBoard;
export { Repository };
