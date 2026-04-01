import 'dart:async';

import 'package:flutter/widgets.dart';

Future<void> settleScrollToBottom(
  ScrollController controller, {
  int attempts = 5,
}) async {
  for (var attempt = 0; attempt < attempts; attempt++) {
    await WidgetsBinding.instance.endOfFrame;
    if (!controller.hasClients) {
      continue;
    }

    try {
      controller.jumpTo(controller.position.maxScrollExtent);
    } catch (_) {
      return;
    }
  }
}
