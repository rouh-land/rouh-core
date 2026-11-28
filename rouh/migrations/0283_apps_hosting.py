"""Apps (`rouh/apps_hosting.py`, `rouh/models/apps.py`): the person's apps servers, apps, the commands
Rouh sends a server, and a host's sealed API token.

Four new tables of their own, empty, so adding them touches no row of any other table, and code still
running from before them never reads or writes them. Going back drops them.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('rouh', '0282_notice_details'),
    ]

    operations = [
        migrations.CreateModel(
            name='AppServer',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('user_id', models.TextField()),
                ('org_id', models.TextField()),
                ('name', models.TextField()),
                ('host', models.TextField(default='other')),
                ('address', models.TextField(default='')),
                ('state', models.TextField(default='waiting')),
                ('standard', models.BooleanField(default=True)),
                ('join_sealed', models.TextField(default='')),
                ('join_until', models.FloatField(default=0)),
                ('key_hash', models.TextField(db_index=True, default='')),
                ('made_at', models.FloatField(default=0)),
                ('joined_at', models.FloatField(default=0)),
                ('seen_at', models.FloatField(default=0)),
                ('full_at', models.FloatField(default=0)),
                ('facts', models.JSONField(default=dict)),
                ('host_ref', models.TextField(default='')),
                ('note', models.TextField(default='')),
            ],
            options={
                'db_table': 'app_servers',
                'constraints': [models.UniqueConstraint(fields=('org_id', 'user_id', 'name'), name='app_servers_one_name')],
            },
        ),
        migrations.CreateModel(
            name='HostToken',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('user_id', models.TextField()),
                ('org_id', models.TextField()),
                ('host', models.TextField()),
                ('sealed', models.TextField()),
                ('last4', models.TextField(default='')),
                ('saved_at', models.FloatField(default=0)),
            ],
            options={
                'db_table': 'app_host_tokens',
                'constraints': [models.UniqueConstraint(fields=('org_id', 'user_id', 'host'), name='app_host_tokens_one')],
            },
        ),
        migrations.CreateModel(
            name='AppCommand',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('user_id', models.TextField()),
                ('org_id', models.TextField()),
                ('app', models.TextField(default='')),
                ('verb', models.TextField()),
                ('args', models.JSONField(default=dict)),
                ('state', models.TextField(default='waiting')),
                ('asked_at', models.FloatField(default=0)),
                ('sent_at', models.FloatField(default=0)),
                ('done_at', models.FloatField(default=0)),
                ('output', models.TextField(default='')),
                ('asked_by', models.TextField(default='page')),
                ('server', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='+', to='rouh.appserver')),
            ],
            options={
                'db_table': 'app_commands',
                'indexes': [models.Index(fields=['server', 'state'], name='app_commands_server_state')],
            },
        ),
        migrations.CreateModel(
            name='HostedApp',
            fields=[
                ('id', models.BigAutoField(primary_key=True, serialize=False)),
                ('user_id', models.TextField()),
                ('org_id', models.TextField()),
                ('slug', models.TextField()),
                ('name', models.TextField()),
                ('what', models.TextField(default='')),
                ('url', models.TextField(default='')),
                ('health_url', models.TextField(default='')),
                ('elsewhere', models.TextField(default='')),
                ('kind', models.TextField(default='')),
                ('repo', models.TextField(default='')),
                ('state', models.TextField(default='unknown')),
                ('checked_at', models.FloatField(default=0)),
                ('check_said', models.TextField(default='')),
                ('down_since', models.FloatField(default=0)),
                ('report', models.JSONField(default=dict)),
                ('made_at', models.FloatField(default=0)),
                ('made_by', models.TextField(default='page')),
                ('server', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='rouh.appserver')),
            ],
            options={
                'db_table': 'hosted_apps',
                'constraints': [models.UniqueConstraint(fields=('org_id', 'user_id', 'slug'), name='hosted_apps_one_slug')],
            },
        ),
    ]
