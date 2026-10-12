<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sourates', function (Blueprint $table) {
            $table->unsignedTinyInteger('numero')->primary();
            $table->string('nom', 40)->unique();
            $table->string('nom_arabe', 40);
            $table->unsignedSmallInteger('nombre_versets');
        });

        $sourates = [
            ['Al-Fatiha', 'الفاتحة', 7], ['Al-Baqara', 'البقرة', 286], ['Aal-Imran', 'آل عمران', 200],
            ['An-Nisa', 'النساء', 176], ['Al-Maida', 'المائدة', 120], ['Al-Anam', 'الأنعام', 165],
            ['Al-Araf', 'الأعراف', 206], ['Al-Anfal', 'الأنفال', 75], ['At-Tawba', 'التوبة', 129],
            ['Yunus', 'يونس', 109], ['Hud', 'هود', 123], ['Yusuf', 'يوسف', 111],
            ['Ar-Rad', 'الرعد', 43], ['Ibrahim', 'إبراهيم', 52], ['Al-Hijr', 'الحجر', 99],
            ['An-Nahl', 'النحل', 128], ['Al-Isra', 'الإسراء', 111], ['Al-Kahf', 'الكهف', 110],
            ['Maryam', 'مريم', 98], ['Ta-Ha', 'طه', 135], ['Al-Anbiya', 'الأنبياء', 112],
            ['Al-Hajj', 'الحج', 78], ['Al-Muminun', 'المؤمنون', 118], ['An-Nur', 'النور', 64],
            ['Al-Furqan', 'الفرقان', 77], ['Ash-Shuara', 'الشعراء', 227], ['An-Naml', 'النمل', 93],
            ['Al-Qasas', 'القصص', 88], ['Al-Ankabut', 'العنكبوت', 69], ['Ar-Rum', 'الروم', 60],
            ['Luqman', 'لقمان', 34], ['As-Sajda', 'السجدة', 30], ['Al-Ahzab', 'الأحزاب', 73],
            ['Saba', 'سبأ', 54], ['Fatir', 'فاطر', 45], ['Ya-Sin', 'يس', 83],
            ['As-Saffat', 'الصافات', 182], ['Sad', 'ص', 88], ['Az-Zumar', 'الزمر', 75],
            ['Ghafir', 'غافر', 85], ['Fussilat', 'فصلت', 54], ['Ash-Shura', 'الشورى', 53],
            ['Az-Zukhruf', 'الزخرف', 89], ['Ad-Dukhan', 'الدخان', 59], ['Al-Jathiya', 'الجاثية', 37],
            ['Al-Ahqaf', 'الأحقاف', 35], ['Muhammad', 'محمد', 38], ['Al-Fath', 'الفتح', 29],
            ['Al-Hujurat', 'الحجرات', 18], ['Qaf', 'ق', 45], ['Adh-Dhariyat', 'الذاريات', 60],
            ['At-Tur', 'الطور', 49], ['An-Najm', 'النجم', 62], ['Al-Qamar', 'القمر', 55],
            ['Ar-Rahman', 'الرحمن', 78], ['Al-Waqia', 'الواقعة', 96], ['Al-Hadid', 'الحديد', 29],
            ['Al-Mujadila', 'المجادلة', 22], ['Al-Hashr', 'الحشر', 24], ['Al-Mumtahana', 'الممتحنة', 13],
            ['As-Saff', 'الصف', 14], ['Al-Jumua', 'الجمعة', 11], ['Al-Munafiqun', 'المنافقون', 11],
            ['At-Taghabun', 'التغابن', 18], ['At-Talaq', 'الطلاق', 12], ['At-Tahrim', 'التحريم', 12],
            ['Al-Mulk', 'الملك', 30], ['Al-Qalam', 'القلم', 52], ['Al-Haqqa', 'الحاقة', 52],
            ['Al-Maarij', 'المعارج', 44], ['Nuh', 'نوح', 28], ['Al-Jinn', 'الجن', 28],
            ['Al-Muzzammil', 'المزمل', 20], ['Al-Muddaththir', 'المدثر', 56], ['Al-Qiyama', 'القيامة', 40],
            ['Al-Insan', 'الإنسان', 31], ['Al-Mursalat', 'المرسلات', 50], ['An-Naba', 'النبأ', 40],
            ['An-Naziat', 'النازعات', 46], ['Abasa', 'عبس', 42], ['At-Takwir', 'التكوير', 29],
            ['Al-Infitar', 'الانفطار', 19], ['Al-Mutaffifin', 'المطففين', 36], ['Al-Inshiqaq', 'الانشقاق', 25],
            ['Al-Buruj', 'البروج', 22], ['At-Tariq', 'الطارق', 17], ['Al-Ala', 'الأعلى', 19],
            ['Al-Ghashiya', 'الغاشية', 26], ['Al-Fajr', 'الفجر', 30], ['Al-Balad', 'البلد', 20],
            ['Ash-Shams', 'الشمس', 15], ['Al-Layl', 'الليل', 21], ['Ad-Duha', 'الضحى', 11],
            ['Ash-Sharh', 'الشرح', 8], ['At-Tin', 'التين', 8], ['Al-Alaq', 'العلق', 19],
            ['Al-Qadr', 'القدر', 5], ['Al-Bayyina', 'البينة', 8], ['Az-Zalzala', 'الزلزلة', 8],
            ['Al-Adiyat', 'العاديات', 11], ['Al-Qaria', 'القارعة', 11], ['At-Takathur', 'التكاثر', 8],
            ['Al-Asr', 'العصر', 3], ['Al-Humaza', 'الهمزة', 9], ['Al-Fil', 'الفيل', 5],
            ['Quraysh', 'قريش', 4], ['Al-Maun', 'الماعون', 7], ['Al-Kawthar', 'الكوثر', 3],
            ['Al-Kafirun', 'الكافرون', 6], ['An-Nasr', 'النصر', 3], ['Al-Masad', 'المسد', 5],
            ['Al-Ikhlas', 'الإخلاص', 4], ['Al-Falaq', 'الفلق', 5], ['An-Nas', 'الناس', 6],
        ];

        foreach ($sourates as $index => [$name, $arabic, $verses]) {
            DB::table('sourates')->insert([
                'numero' => $index + 1,
                'nom' => $name,
                'nom_arabe' => $arabic,
                'nombre_versets' => $verses,
            ]);
        }

        Schema::table('fiches_hebdomadaires', function (Blueprint $table) {
            $table->string('statut', 16)->default('brouillon');
            $table->index(['eleve_id', 'date_debut', 'statut']);
        });

        Schema::table('notes', function (Blueprint $table) {
            foreach (['d', 'j', 'm'] as $repere) {
                $table->unsignedTinyInteger("{$repere}_sourate_debut")->nullable();
                $table->unsignedSmallInteger("{$repere}_verset_debut")->nullable();
                $table->unsignedTinyInteger("{$repere}_sourate_fin")->nullable();
                $table->unsignedSmallInteger("{$repere}_verset_fin")->nullable();
                $table->foreign("{$repere}_sourate_debut")->references('numero')->on('sourates')->restrictOnDelete();
                $table->foreign("{$repere}_sourate_fin")->references('numero')->on('sourates')->restrictOnDelete();
            }
            $table->unsignedTinyInteger('qualite_recitation')->nullable();
        });

        Schema::table('plannings', function (Blueprint $table) {
            $table->string('jour_semaine', 10)->nullable()->index();
        });

        foreach (DB::table('plannings')->get(['id', 'date']) as $planning) {
            $day = (int) date('w', strtotime($planning->date));
            $days = [0 => 'dimanche', 1 => 'lundi', 2 => 'mardi', 3 => 'mercredi', 4 => 'jeudi', 5 => 'vendredi', 6 => 'samedi'];
            DB::table('plannings')->where('id', $planning->id)->update(['jour_semaine' => $days[$day]]);
        }

        Schema::create('presences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('planning_id')->constrained('plannings')->restrictOnDelete();
            $table->foreignId('eleve_id')->constrained('eleves')->restrictOnDelete();
            $table->date('date_cours');
            $table->string('statut', 12);
            $table->foreignId('saisi_par')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['planning_id', 'eleve_id', 'date_cours']);
            $table->index(['eleve_id', 'date_cours', 'statut']);
        });

        Schema::create('evaluations_exemplarite', function (Blueprint $table) {
            $table->id();
            $table->foreignId('eleve_id')->constrained('eleves')->restrictOnDelete();
            $table->char('mois', 7);
            $table->unsignedTinyInteger('assiduite_ponctualite');
            $table->unsignedTinyInteger('discipline_comportement');
            $table->unsignedTinyInteger('proprete_hygiene');
            $table->unsignedTinyInteger('camaraderie_respect');
            $table->unsignedTinyInteger('prieres_devotion');
            $table->foreignId('evalue_par')->constrained('users')->restrictOnDelete();
            $table->timestamps();
            $table->unique(['eleve_id', 'mois']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('evaluations_exemplarite');
        Schema::dropIfExists('presences');
        Schema::table('plannings', function (Blueprint $table) {
            $table->dropIndex(['jour_semaine']);
            $table->dropColumn('jour_semaine');
        });
        Schema::table('notes', function (Blueprint $table) {
            foreach (['d', 'j', 'm'] as $repere) {
                $table->dropForeign(["{$repere}_sourate_debut"]);
                $table->dropForeign(["{$repere}_sourate_fin"]);
                $table->dropColumn([
                    "{$repere}_sourate_debut", "{$repere}_verset_debut",
                    "{$repere}_sourate_fin", "{$repere}_verset_fin",
                ]);
            }
            $table->dropColumn('qualite_recitation');
        });
        Schema::table('fiches_hebdomadaires', function (Blueprint $table) {
            $table->dropIndex(['eleve_id', 'date_debut', 'statut']);
            $table->dropColumn('statut');
        });
        Schema::dropIfExists('sourates');
    }
};
