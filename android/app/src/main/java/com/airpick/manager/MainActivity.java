package com.airpick.manager;

import android.graphics.Color;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import androidx.activity.SystemBarStyle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int BAR_SCRIM = Color.parseColor("#09090B");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        EdgeToEdge.enable(this, SystemBarStyle.dark(BAR_SCRIM), SystemBarStyle.dark(BAR_SCRIM));
        super.onCreate(savedInstanceState);

        // 시스템 바 여백은 capacitor.config.ts 의 adjustMarginsForEdgeToEdge(force)가 WebView margin 으로 처리한다.
    }
}
