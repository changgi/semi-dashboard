import { NextRequest, NextResponse } from "next/server";
import { createAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ═══════════════════════════════════════════════════════════
// Recovery Plan API
// 
// GET: 활성 플랜 + 전체 태스크 + 진행률
// PATCH: 태스크 상태 변경 (completed/in_progress/skipped)
// POST: 새 플랜 생성 (향후 시즌 2, 3)
// ═══════════════════════════════════════════════════════════

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdmin();
    
    // 활성 플랜 조회
    const { data: plans } = await supabase
      .from("recovery_plans")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (!plans || plans.length === 0) {
      return NextResponse.json({
        success: true,
        hasPlan: false,
        message: "활성 복구 플랜 없음. Supabase에서 recovery_plan_migration.sql 실행 필요.",
      });
    }
    
    const plan = plans[0];
    
    // 태스크 조회
    const { data: tasks } = await supabase
      .from("recovery_tasks")
      .select("*")
      .eq("plan_id", plan.id)
      .order("week_number", { ascending: true })
      .order("task_order", { ascending: true });
    
    const allTasks = tasks ?? [];
    
    // 주차별 그룹핑
    const weeks: Record<number, any> = {};
    for (const task of allTasks) {
      const w = task.week_number;
      if (!weeks[w]) {
        weeks[w] = {
          number: w,
          title: task.week_title,
          theme: task.week_theme,
          tasks: [],
          completedCount: 0,
          totalCount: 0,
        };
      }
      weeks[w].tasks.push(task);
      weeks[w].totalCount++;
      if (task.status === "completed") weeks[w].completedCount++;
    }
    
    // 전체 진행률
    const totalTasks = allTasks.length;
    const completedTasks = allTasks.filter((t: any) => t.status === "completed").length;
    const inProgressTasks = allTasks.filter((t: any) => t.status === "in_progress").length;
    const skippedTasks = allTasks.filter((t: any) => t.status === "skipped").length;
    const overallPct = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    
    // 현재 주차 자동 계산
    const now = new Date();
    const startDate = new Date(plan.start_date);
    const diffMs = now.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    const calculatedCurrentWeek = Math.max(1, Math.min(plan.total_weeks, Math.floor(diffDays / 7) + 1));
    
    // 현재 주차 업데이트
    if (calculatedCurrentWeek !== plan.current_week) {
      await supabase
        .from("recovery_plans")
        .update({ current_week: calculatedCurrentWeek, updated_at: new Date().toISOString() })
        .eq("id", plan.id);
      plan.current_week = calculatedCurrentWeek;
    }
    
    // 다음 미완료 태스크
    const nextTask = allTasks.find((t: any) => t.status === "pending" && t.week_number <= calculatedCurrentWeek + 1);
    
    return NextResponse.json({
      success: true,
      hasPlan: true,
      plan: {
        id: plan.id,
        title: plan.title,
        description: plan.description,
        startDate: plan.start_date,
        endDate: plan.end_date,
        totalWeeks: plan.total_weeks,
        currentWeek: calculatedCurrentWeek,
        initialValue: plan.initial_portfolio_value,
        initialLossPct: plan.initial_loss_pct,
        initialHealth: plan.initial_health_score,
        targetValue: plan.target_portfolio_value,
        targetHealth: plan.target_health_score,
        motto: plan.motto,
        principles: plan.principles ?? [],
      },
      progress: {
        overallPct: Math.round(overallPct),
        totalTasks,
        completedTasks,
        inProgressTasks,
        skippedTasks,
        pendingTasks: totalTasks - completedTasks - inProgressTasks - skippedTasks,
      },
      weeks: Object.values(weeks).sort((a: any, b: any) => a.number - b.number),
      nextTask,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      success: false,
      _soft_failure: true,
      error: msg,
      hasPlan: false,
    });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const supabase = createAdmin();
    
    if (!body.taskId) {
      return NextResponse.json({ success: false, error: "taskId 필수" }, { status: 400 });
    }
    
    const updates: any = {};
    if (body.status) {
      updates.status = body.status;
      if (body.status === "completed") {
        updates.completed_at = new Date().toISOString();
      }
    }
    if (body.note !== undefined) updates.completed_note = body.note;
    
    const { data, error } = await supabase
      .from("recovery_tasks")
      .update(updates)
      .eq("id", body.taskId)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }
    
    // 플랜 전체 진행률 재계산
    const { data: allTasks } = await supabase
      .from("recovery_tasks")
      .select("status")
      .eq("plan_id", data.plan_id);
    
    if (allTasks && allTasks.length > 0) {
      const completed = allTasks.filter((t: any) => t.status === "completed").length;
      const pct = (completed / allTasks.length) * 100;
      await supabase
        .from("recovery_plans")
        .update({ completion_pct: pct, updated_at: new Date().toISOString() })
        .eq("id", data.plan_id);
    }
    
    // ═══════════════════════════════════════
    // 완료 시 health_change 누적 계산
    // ═══════════════════════════════════════
    let expectedHealthGain = 0;
    let completedHealthGain = 0;
    if (body.status === "completed" || data.status === "completed") {
      const { data: completedTasks } = await supabase
        .from("recovery_tasks")
        .select("target_health_change, status")
        .eq("plan_id", data.plan_id);
      
      if (completedTasks) {
        for (const t of completedTasks) {
          const gain = t.target_health_change ?? 0;
          expectedHealthGain += gain;
          if (t.status === "completed") completedHealthGain += gain;
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      task: data,
      planProgress: {
        completedHealthGain,
        expectedHealthGain,
        remainingHealthGain: expectedHealthGain - completedHealthGain,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ success: false, error: msg });
  }
}
